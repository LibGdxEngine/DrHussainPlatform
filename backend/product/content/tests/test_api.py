from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase

from apps.audit.models import AuditLog
from apps.organizations.models import Organization, OrganizationMember
from product.content.models import AlertRule, EmailTemplate, Leaflet
from product.testing import PrivateStorageMixin, make_member

BASE = '/api/product/content/'
PDF = b'%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'


class ContentTestCase(PrivateStorageMixin, APITestCase):
    def setUp(self):
        super().setUp()
        self.clinic = Organization.objects.create(name='V-Clinic', slug='v-clinic')
        self.staff = make_member(self.clinic, 'staff@example.com')
        self.doctor = make_member(self.clinic, 'doctor@example.com', role=OrganizationMember.Role.OWNER)
        self.client.force_authenticate(self.doctor)


class TemplateTests(ContentTestCase):
    def template(self, key='sti_opening'):
        response = self.client.get(f'{BASE}templates/', {'kind': 'infection'})
        return next(t for t in response.data['results'] if t['key'] == key)

    def test_starter_slots_follow_the_routing_table_and_are_not_approved(self):
        response = self.client.get(f'{BASE}templates/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        keys = {t['key'] for t in response.data['results']}
        self.assertTrue({'results', 'menopause_results', 'follow_up_comparison', 'pathology_results', 'sti_opening',
                         'sti_closing', 'sti_section_chlamydia', 'smear_section_1', 'smear_section_14',
                         'prescription_reply'} <= keys)
        self.assertTrue(all(t['approved'] is None for t in response.data['results']))
        self.assertIn('[[Paste the approved wording', response.data['results'][0]['latest']['body'])

    def test_saving_wording_adds_a_draft_version_and_approving_makes_it_used(self):
        template = self.template()
        url = f'{BASE}templates/{template["id"]}/'
        saved = self.client.post(f'{url}versions/', {
            'subject': 'Your results', 'body': 'Dear {{patient.first_name}},\nYour swab results are back.',
            'note': 'Master copy v2',
        }, format='json')
        self.assertEqual(saved.status_code, status.HTTP_201_CREATED)
        self.assertEqual(saved.data['latest']['number'], 2)
        self.assertIsNone(saved.data['approved'])

        approved = self.client.post(f'{url}approve/', {'number': 2}, format='json')
        self.assertEqual(approved.data['approved']['number'], 2)
        self.assertEqual(approved.data['approved']['approved_by_name'], 'doctor@example.com')

        # A later draft does not replace the approved wording until it is approved too.
        self.client.post(f'{url}versions/', {'body': 'Dear {{patient.first_name}}, draft'}, format='json')
        current = self.client.get(url).data
        self.assertEqual((current['latest']['number'], current['approved']['number']), (3, 2))

        history = self.client.get(f'{url}versions/').data
        self.assertEqual([v['number'] for v in history], [3, 2, 1])
        self.assertTrue(AuditLog.objects.filter(action='template.approved').exists())

    def test_save_and_approve_together_and_unchanged_wording_adds_nothing(self):
        template = self.template()
        url = f'{BASE}templates/{template["id"]}/versions/'
        body = {'body': 'Dear {{patient.first_name}}', 'approve': True}
        first = self.client.post(url, body, format='json')
        self.assertEqual(first.data['approved']['number'], 2)
        again = self.client.post(url, body, format='json')
        self.assertEqual(again.status_code, status.HTTP_200_OK)
        self.assertEqual(again.data['latest']['number'], 2)

    def test_unknown_placeholders_are_refused(self):
        template = self.template()
        response = self.client.post(f'{BASE}templates/{template["id"]}/versions/',
                                    {'body': 'Hi {{patient.nickname}}'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['error']['fields']['body'], ['Unknown placeholder: {{patient.nickname}}.'])

    def test_preview_fills_a_sample_patient(self):
        self.client.patch(f'{BASE}profile/', {'phone': '+20 2 0000 0000'}, format='json')
        self.client.force_authenticate(self.staff)
        response = self.client.post(f'{BASE}templates/preview/', {
            'subject': 'Results for {{patient.first_name}}',
            'body': 'Phone {{clinic.phone}} to book. {{prescription}} Repeat in [[interval]].',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['subject'], 'Results for Laila')
        self.assertIn('Phone +20 2 0000 0000 to book.', response.data['body'])
        self.assertEqual(response.data['open_slots'], ['prescription', 'interval'])

    def test_arabic_version_of_a_template(self):
        response = self.client.post(f'{BASE}templates/', {
            'key': 'results', 'language': 'ar', 'name': 'Results email (Arabic)', 'kind': 'results',
            'body': '{{patient.first_name}} العزيزة',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['latest']['number'], 1)
        duplicate = self.client.post(f'{BASE}templates/', {
            'key': 'results', 'language': 'ar', 'name': 'Again', 'kind': 'results', 'body': 'x',
        }, format='json')
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)

    def test_staff_can_read_but_not_change_templates(self):
        template = self.template()
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get(f'{BASE}templates/').status_code, status.HTTP_200_OK)
        response = self.client.post(f'{BASE}templates/{template["id"]}/versions/', {'body': 'x'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_default_leaflets(self):
        leaflet = self.client.post(f'{BASE}leaflets/', {
            'title': 'HPV information', 'file': SimpleUploadedFile('hpv.pdf', PDF, content_type='application/pdf'),
        }, format='multipart').data
        template = self.template('sti_section_hpv_high_risk')
        response = self.client.patch(f'{BASE}templates/{template["id"]}/', {'default_leaflets': [leaflet['id']]},
                                     format='json')
        self.assertEqual([str(i) for i in response.data['default_leaflets']], [str(leaflet['id'])])

    def test_everyday_templates_start_pinned_and_the_doctor_can_change_them(self):
        pinned = self.client.get(f'{BASE}templates/', {'pinned': 'true'}).data['results']
        self.assertEqual({t['key'] for t in pinned}, {'results', 'menopause_results', 'follow_up_comparison',
                                                      'sti_opening', 'smear_section_1', 'prescription_reply'})
        closing = self.template('sti_closing')
        self.assertFalse(closing['pinned'])
        url = f'{BASE}templates/{closing["id"]}/'
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.patch(url, {'pinned': True}, format='json').status_code,
                         status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.doctor)
        self.assertTrue(self.client.patch(url, {'pinned': True}, format='json').data['pinned'])
        self.assertIn('sti_closing', {t['key'] for t in self.client.get(f'{BASE}templates/', {'pinned': 'true'}).data['results']})


class PrescriptionTests(ContentTestCase):
    def test_list_item_history(self):
        created = self.client.post(f'{BASE}prescriptions/', {
            'drug': 'Example drug 100 mg', 'dose': '100 mg', 'directions': 'Once daily', 'note': 'From guideline',
        }, format='json')
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        self.assertEqual(created.data['version'], 1)
        url = f'{BASE}prescriptions/{created.data["id"]}/'

        changed = self.client.patch(url, {'dose': '200 mg', 'note': 'Monthly check'}, format='json')
        self.assertEqual((changed.data['version'], changed.data['dose'], changed.data['drug']),
                         (2, '200 mg', 'Example drug 100 mg'))
        reordered = self.client.patch(url, {'sort_order': 5}, format='json')
        self.assertEqual(reordered.data['version'], 2)

        archived = self.client.patch(url, {'archived': True}, format='json')
        self.assertTrue(archived.data['archived'])
        self.assertEqual(self.client.get(f'{BASE}prescriptions/').data['results'], [])
        self.assertEqual(self.client.get(f'{BASE}prescriptions/', {'archived': 'true'}).data['count'], 1)
        self.assertEqual([v['dose'] for v in self.client.get(f'{url}versions/').data], ['200 mg', '100 mg'])
        self.assertEqual(self.client.delete(url).status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


class AlertRuleTests(ContentTestCase):
    def test_starter_rules_r1_to_r40(self):
        response = self.client.get(f'{BASE}alert-rules/')
        self.assertEqual([r['code'] for r in response.data['results']], [f'R{n}' for n in range(1, 41)])
        r7 = response.data['results'][6]
        self.assertEqual((r7['pre'], r7['threshold_a'], r7['mid'], r7['level']), ('≥', '12', 'months', 'red'))

    def test_bulk_save_versions_each_changed_rule(self):
        response = self.client.post(f'{BASE}alert-rules/bulk/', {'note': 'Guideline update', 'rules': [
            {'code': 'R7', 'threshold_a': '6'}, {'code': 'R20', 'threshold_a': '135', 'threshold_b': '85'},
            {'code': 'R18', 'enabled': False}, {'code': 'R1', 'enabled': True},
        ]}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(sorted(r['code'] for r in response.data), ['R18', 'R20', 'R7'])
        rule = AlertRule.objects.get(organization=self.clinic, code='R20')
        self.assertEqual((rule.current.threshold_a, rule.current.threshold_b, rule.current.number), ('135', '85', 2))
        self.assertEqual(rule.current.note, 'Guideline update')
        self.assertEqual(AuditLog.objects.filter(action='alert_rule.updated').count(), 3)

    def test_bulk_save_is_all_or_nothing(self):
        response = self.client.post(f'{BASE}alert-rules/bulk/', {'rules': [
            {'code': 'R7', 'threshold_a': '6'}, {'code': 'R1', 'threshold_a': '3'},
        ]}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('rules.1.threshold_a', response.data['error']['fields'])
        self.assertEqual(AlertRule.objects.get(organization=self.clinic, code='R7').current.threshold_a, '12')

    def test_new_rules_get_the_next_code(self):
        self.client.get(f'{BASE}alert-rules/')
        response = self.client.post(f'{BASE}alert-rules/', {
            'field': 'Ferritin (labs)', 'pre': '<', 'threshold_a': '30', 'mid': 'ng/mL', 'level': 'amber',
            'message': 'Iron deficiency: check symptoms',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['code'], 'R41')

    def test_staff_cannot_change_rules(self):
        self.client.force_authenticate(self.staff)
        response = self.client.post(f'{BASE}alert-rules/bulk/', {'rules': [{'code': 'R7', 'threshold_a': '1'}]},
                                    format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class ScoreBandTests(ContentTestCase):
    def test_mrs_bands(self):
        current = self.client.get(f'{BASE}score-bands/mrs/').data['current']
        self.assertEqual([b['min'] for b in current['bands']], [5, 9, 16])
        response = self.client.post(f'{BASE}score-bands/mrs/bands/', {'bands': [
            {'label': 'Mild', 'min': 4}, {'label': 'Moderate', 'min': 9}, {'label': 'Severe', 'min': 16},
        ]}, format='json')
        self.assertEqual(response.data['current']['number'], 2)
        bad = self.client.post(f'{BASE}score-bands/mrs/bands/', {'bands': [
            {'label': 'Mild', 'min': 9}, {'label': 'Moderate', 'min': 5},
        ]}, format='json')
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)


class LeafletTests(ContentTestCase):
    def test_upload_replace_and_download_each_version(self):
        created = self.client.post(f'{BASE}leaflets/', {
            'title': 'Recurrent thrush', 'file': SimpleUploadedFile('thrush.pdf', PDF, content_type='application/pdf'),
        }, format='multipart')
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        url = f'{BASE}leaflets/{created.data["id"]}/'
        newer = PDF + b'%v2'
        replaced = self.client.post(f'{url}replace/', {
            'file': SimpleUploadedFile('thrush-2026.pdf', newer, content_type='application/pdf'), 'note': 'Reviewed',
        }, format='multipart')
        self.assertEqual(replaced.data['current']['number'], 2)
        self.assertEqual(b''.join(self.client.get(f'{url}file/').streaming_content), newer)
        self.assertEqual(b''.join(self.client.get(f'{url}file/', {'version': 1}).streaming_content), PDF)
        self.assertEqual(Leaflet.objects.get().versions.count(), 2)

    def test_only_pdfs(self):
        response = self.client.post(f'{BASE}leaflets/', {
            'title': 'Image', 'file': SimpleUploadedFile('x.png', b'\x89PNG\r\n\x1a\n...', content_type='image/png'),
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_415_UNSUPPORTED_MEDIA_TYPE)
        self.assertFalse(Leaflet.objects.exists())


class LabTestCatalogTests(ContentTestCase):
    URL = '/api/product/results/tests/'

    def test_doctor_edits_targets_tracking_and_lab_names(self):
        ferritin = next(t for t in self.client.get(self.URL).data['results'] if t['code'] == 'ferritin')
        self.assertIn('serum ferritin', ferritin['aliases'])
        response = self.client.patch(f'{self.URL}{ferritin["id"]}/', {
            'optimal_low': '70', 'optimal_text': '70–150', 'aliases': ['Ferritin, serum', 'S. Ferritin'],
            'code': 'renamed',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual((response.data['code'], response.data['optimal_low']), ('ferritin', '70.0000'))
        self.assertEqual(response.data['aliases'], ['ferritin serum', 's ferritin'])

    def test_targets_and_alias_clashes_are_checked(self):
        tests = {t['code']: t for t in self.client.get(self.URL).data['results']}
        bad_range = self.client.patch(f'{self.URL}{tests["tsh"]["id"]}/', {'optimal_low': '3'}, format='json')
        self.assertEqual(bad_range.status_code, status.HTTP_400_BAD_REQUEST)
        clash = self.client.patch(f'{self.URL}{tests["tsh"]["id"]}/', {'aliases': ['serum ferritin']}, format='json')
        self.assertIn('aliases', clash.data['error']['fields'])

    def test_new_test(self):
        response = self.client.post(self.URL, {
            'code': 'zinc', 'name': 'Zinc', 'kind': 'numeric', 'default_unit': 'ug/dL', 'aliases': ['serum zinc'],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['aliases'], ['serum zinc', 'zinc'])

    def test_staff_cannot_edit_the_catalog(self):
        ferritin = next(t for t in self.client.get(self.URL).data['results'] if t['code'] == 'ferritin')
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get(self.URL).status_code, status.HTTP_200_OK)
        response = self.client.patch(f'{self.URL}{ferritin["id"]}/', {'tracked': False}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_other_clinics_never_see_this_content(self):
        self.client.get(f'{BASE}templates/')
        other = Organization.objects.create(name='Other', slug='other')
        self.client.force_authenticate(make_member(other, 'other@example.com', role=OrganizationMember.Role.OWNER))
        template = EmailTemplate.objects.filter(organization=self.clinic).first()
        self.assertEqual(self.client.get(f'{BASE}templates/{template.id}/').status_code, status.HTTP_404_NOT_FOUND)
