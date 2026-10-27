from datetime import date
from importlib import import_module

from django.apps import apps as django_apps
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.organizations.models import Organization, OrganizationMember
from product.alerts.models import PatientAlert
from product.alerts.services import evaluate_patient
from product.content.models import AlertRule, AlertRuleVersion, EmailTemplate, EmailTemplateVersion
from product.content.starter import ensure_starter_content
from product.content.versioning import add_version
from product.patients.services import create_patient
from product.records.services import store_document
from product.results.catalog import ensure_catalog
from product.results.models import LabTest
from product.results.pipeline import process_document
from product.results.tests import pdfs
from product.review.services import route_report
from product.testing import PrivateStorageMixin, make_member


class AlertTestCase(PrivateStorageMixin, APITestCase):
    def setUp(self):
        super().setUp()
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.staff = make_member(self.clinic, 'staff@example.com')
        self.doctor = make_member(self.clinic, 'doctor@example.com', role=OrganizationMember.Role.OWNER)
        self.client.force_authenticate(self.doctor)
        self.patient = create_patient(self.clinic, full_name='Laila Ahmed', date_of_birth=date(1974, 3, 9),
                                      email='laila@example.com')
        ensure_starter_content(self.clinic)
        ensure_catalog(self.clinic)
        template = EmailTemplate.objects.get(organization=self.clinic, key='results', language='en')
        version, _ = add_version(template, EmailTemplateVersion, {'body': '{{results.table}}'}, user=self.doctor)
        version.approved_at = timezone.now()
        version.save()

    def read(self, rows, name='report.pdf', collected='03/10/2026'):
        document = store_document(
            organization=self.clinic, patient=self.patient, uploaded_by=self.staff, slot='lab',
            upload=SimpleUploadedFile(name, pdfs.make_pdf(pdfs.header(collected=collected) + rows),
                                      content_type='application/pdf'),
        )
        return route_report(process_document(document))

    def alerts(self, **filters):
        return {a.rule.code: a for a in PatientAlert.objects.filter(patient=self.patient, **filters)}


class EvaluationTests(AlertTestCase):
    def test_testosterone_above_the_cut_off_fires_r34_and_a_later_normal_result_clears_it(self):
        self.read(['Testosterone 62 ng/dL 8 - 60'], name='high.pdf', collected='03/07/2026')
        r34 = self.alerts(status='open')['R34']
        self.assertEqual((r34.level, r34.detail, r34.rule_version.number), ('amber', '62 ng/dL > 50', 1))
        self.read(['Testosterone 40 ng/dL 8 - 60'], name='normal.pdf', collected='03/10/2026')
        self.assertEqual(self.alerts()['R34'].status, 'resolved')

    def test_lp_a_is_a_reminder_until_measured(self):
        evaluate_patient(self.patient)
        self.assertEqual(self.alerts(status='open')['R39'].level, 'reminder')
        self.read(['Lp(a) 40 nmol/L <75'])
        self.assertEqual(self.alerts()['R39'].status, 'resolved')

    def test_disabled_rules_and_unset_cut_offs_do_not_fire(self):
        rule = AlertRule.objects.get(organization=self.clinic, code='R34')
        add_version(rule, AlertRuleVersion, {'enabled': False}, user=self.doctor)
        self.read(['Testosterone 62 ng/dL 8 - 60'])
        self.assertNotIn('R34', self.alerts(status='open'))

    def test_acknowledged_alert_is_not_raised_again_for_the_same_result(self):
        self.read(['Testosterone 62 ng/dL 8 - 60'])
        alert = self.alerts(status='open')['R34']
        response = self.client.post(f'/api/product/alerts/{alert.id}/acknowledge/', {'reason': 'Dose reduced'},
                                    format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['acknowledged_by_name'], 'doctor@example.com')
        evaluate_patient(self.patient)
        self.assertNotIn('R34', self.alerts(status='open'))

    def test_a_red_lab_rule_holds_the_case_for_the_doctor_until_acknowledged(self):
        rule = AlertRule.objects.get(organization=self.clinic, code='R34')
        add_version(rule, AlertRuleVersion, {'level': 'red'}, user=self.doctor)
        case = self.read(['Testosterone 62 ng/dL 8 - 60'])
        self.assertEqual((case.status, case.flag_reasons), ('flagged', ['red_alert_R34']))
        alert = self.alerts(status='open')['R34']
        self.client.post(f'/api/product/alerts/{alert.id}/acknowledge/', {'reason': 'Seen'}, format='json')
        case.refresh_from_db()
        self.assertEqual(case.status, 'drafted')

    def test_list_and_permissions(self):
        self.read(['Testosterone 62 ng/dL 8 - 60'])
        listed = self.client.get('/api/product/alerts/', {'patient': str(self.patient.id)}).data['results']
        self.assertEqual(sorted(a['code'] for a in listed), ['R34', 'R39'])
        self.client.force_authenticate(self.staff)
        alert = self.alerts(status='open')['R34']
        self.assertEqual(self.client.post(f'/api/product/alerts/{alert.id}/acknowledge/', {'reason': 'x'},
                                          format='json').status_code, status.HTTP_403_FORBIDDEN)


class RuleSettingsTests(AlertTestCase):
    def test_lab_checks_are_validated(self):
        rule = AlertRule.objects.get(organization=self.clinic, code='R33')
        url = f'/api/product/content/alert-rules/{rule.id}/'
        missing = self.client.patch(url, {'lab_check': 'gt'}, format='json')
        self.assertIn('lab_test_code', missing.data['error']['fields'])
        unknown = self.client.patch(url, {'lab_check': 'gt', 'lab_test_code': 'nope'}, format='json')
        self.assertIn('lab_test_code', unknown.data['error']['fields'])
        ok = self.client.patch(url, {'lab_check': 'gte', 'lab_test_code': 'ferritin'}, format='json')
        self.assertEqual((ok.status_code, ok.data['lab_check']), (status.HTTP_200_OK, 'gte'))

    def test_new_tests_added_by_a_release_join_an_existing_catalog(self):
        LabTest.objects.filter(organization=self.clinic, code='lpa').delete()
        ensure_catalog(self.clinic)
        self.assertTrue(LabTest.objects.filter(organization=self.clinic, code='lpa').exists())

    def test_existing_rules_are_linked_to_results_by_the_data_migration(self):
        rule = AlertRule.objects.get(organization=self.clinic, code='R34')
        AlertRuleVersion.objects.filter(rule=rule).update(lab_check='', lab_test_code='')
        import_module('product.content.migrations.0003_link_starter_lab_rules').link(django_apps, None)
        current = rule.current
        self.assertEqual((current.number, current.lab_test_code, current.lab_check), (2, 'testosterone_total', 'gt'))
