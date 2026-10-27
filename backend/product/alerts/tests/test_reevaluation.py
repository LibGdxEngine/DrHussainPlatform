"""A changed lab rule is applied to existing patients; evaluation stays cheap and safe under concurrency."""
from unittest.mock import patch

from django.core.cache import cache
from django.db import IntegrityError, connection
from django.test.utils import CaptureQueriesContext
from rest_framework import status

from product.alerts.models import PatientAlert
from product.alerts.services import evaluate_patient
from product.alerts.tasks import reevaluate_clinic
from product.content.models import AlertRule, AlertRuleVersion
from product.content.versioning import add_version

from .test_alerts import AlertTestCase

DELAY = 'product.alerts.tasks.reevaluate_clinic.delay'


class ReevaluationTests(AlertTestCase):
    def setUp(self):
        super().setUp()
        cache.clear()

    def test_changing_a_cut_off_re_evaluates_every_patient_in_the_clinic(self):
        self.read(['Testosterone 45 ng/dL 8 - 60'])
        self.assertNotIn('R34', self.alerts(status='open'))
        rule = AlertRule.objects.get(organization=self.clinic, code='R34')
        with patch(DELAY) as delay, self.captureOnCommitCallbacks(execute=True):
            add_version(rule, AlertRuleVersion, {'threshold_a': '40'}, user=self.doctor)
        delay.assert_called_once_with(str(self.clinic.pk))

        self.assertEqual(reevaluate_clinic.apply(args=[str(self.clinic.pk)]).get(), 1)
        opened = self.alerts(status='open')['R34']
        self.assertEqual((opened.detail, opened.rule_version.number), ('45 ng/dL > 40', 2))

        # Raising the cut-off again clears it on the next sweep.
        add_version(rule, AlertRuleVersion, {'threshold_a': '50'}, user=self.doctor)
        reevaluate_clinic.apply(args=[str(self.clinic.pk)])
        self.assertEqual(self.alerts()['R34'].status, PatientAlert.Status.RESOLVED)

    def test_a_bulk_save_queues_one_sweep(self):
        with patch(DELAY) as delay, self.captureOnCommitCallbacks(execute=True):
            response = self.client.post('/api/product/content/alert-rules/bulk/', {'rules': [
                {'code': 'R34', 'threshold_a': '45'}, {'code': 'R39', 'enabled': False},
            ]}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(delay.call_count, 1)

    def test_rules_about_forms_not_results_do_not_sweep(self):
        rule = AlertRule.objects.get(organization=self.clinic, code='R7')
        with patch(DELAY) as delay, self.captureOnCommitCallbacks(execute=True):
            add_version(rule, AlertRuleVersion, {'threshold_a': '6'}, user=self.doctor)
        delay.assert_not_called()

    def test_an_unknown_clinic_is_a_no_op(self):
        self.assertEqual(reevaluate_clinic.apply(args=['00000000-0000-0000-0000-000000000000']).get(), 0)

    def test_an_alert_opened_concurrently_is_tolerated(self):
        with patch.object(PatientAlert.objects, 'create', side_effect=IntegrityError('one open alert per rule')):
            self.assertEqual(evaluate_patient(self.patient), [])  # R39 "never measured" would have opened
        self.assertEqual(self.alerts(status='open'), {})
        # Without the clash the same evaluation opens it.
        self.assertEqual([a.rule.code for a in evaluate_patient(self.patient)], ['R39'])

    def test_evaluation_query_count_does_not_grow_with_the_number_of_rules(self):
        evaluate_patient(self.patient)
        with CaptureQueriesContext(connection) as before:
            evaluate_patient(self.patient)
        for index, code in enumerate(['ferritin', 'tsh', 'hba1c', 'ldl', 'estradiol']):
            rule = AlertRule.objects.create(organization=self.clinic, code=f'R{90 + index}', sort_order=90 + index)
            AlertRuleVersion.objects.create(rule=rule, number=1, field=f'{code} (labs)', pre='>', threshold_a='99999',
                                            level='amber', message='x', lab_test_code=code, lab_check='gt')
        with CaptureQueriesContext(connection) as after:
            evaluate_patient(self.patient)
        self.assertEqual(len(after), len(before), [q['sql'][:90] for q in after])
