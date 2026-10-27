"""Vitals rules (R20 blood pressure, R21 BMI, R22 waist) are checked against the latest examination."""
from importlib import import_module

from django.apps import apps as django_apps
from rest_framework import status

from product.content.models import AlertRule, AlertRuleVersion
from product.content.versioning import add_version

from .test_alerts import AlertTestCase

EXAMS = '/api/product/records/examinations/'


class VitalsAlertTests(AlertTestCase):
    def examine(self, **vitals):
        body = {'patient': str(self.patient.pk), **vitals}
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(EXAMS, body, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        return response.data

    def test_high_blood_pressure_bmi_and_waist_fire_and_a_normal_examination_clears_them(self):
        exam = self.examine(examined_on='2026-07-01', bp1_systolic=144, bp1_diastolic=92, bp2_systolic=138,
                            bp2_diastolic=88, height_cm='162', weight_kg='81', waist_cm='91')
        opened = self.alerts(status='open')
        self.assertEqual(opened['R20'].detail, 'BP 141/90 ≥ 140/90')
        self.assertEqual(opened['R21'].detail, 'BMI 30.9 ≥ 30')
        self.assertEqual(opened['R22'].detail, 'Waist 91 cm > 88 cm')
        self.assertEqual(str(opened['R20'].examination_id), exam['id'])
        self.assertEqual(opened['R20'].level, 'amber')

        self.examine(examined_on='2026-10-01', bp1_systolic=122, bp1_diastolic=78, height_cm='162',
                     weight_kg='70', waist_cm='80')
        resolved = self.alerts()
        self.assertEqual({resolved[c].status for c in ('R20', 'R21', 'R22')}, {'resolved'})

    def test_an_open_alert_shows_the_newest_reading_that_still_fires_it(self):
        self.examine(examined_on='2026-07-01', bp1_systolic=141, bp1_diastolic=90)
        newer = self.examine(examined_on='2026-10-01', bp1_systolic=150, bp1_diastolic=95)
        alert = self.alerts(status='open')['R20']
        self.assertEqual((alert.detail, str(alert.examination_id)), ('BP 150/95 ≥ 140/90', newer['id']))

    def test_diastolic_alone_fires_blood_pressure(self):
        self.examine(bp1_systolic=130, bp1_diastolic=95)
        self.assertEqual(self.alerts(status='open')['R20'].detail, 'BP 130/95 ≥ 140/90')

    def test_an_older_examination_without_the_measurement_does_not_hide_a_newer_one(self):
        self.examine(examined_on='2026-07-01', waist_cm='95')
        self.examine(examined_on='2026-10-01', bp1_systolic=120, bp1_diastolic=80)  # waist not measured
        self.assertIn('R22', self.alerts(status='open'))

    def test_the_clinic_cut_off_is_used(self):
        self.examine(bp1_systolic=150, bp1_diastolic=85)
        rule = AlertRule.objects.get(organization=self.clinic, code='R20')
        add_version(rule, AlertRuleVersion, {'threshold_a': '160', 'threshold_b': '100'}, user=self.doctor)
        from product.alerts.services import evaluate_patient

        evaluate_patient(self.patient)
        self.assertEqual(self.alerts()['R20'].status, 'resolved')

    def test_acknowledged_alert_returns_only_for_a_new_examination(self):
        self.examine(bp1_systolic=150, bp1_diastolic=95)
        alert = self.alerts(status='open')['R20']
        response = self.client.post(f'/api/product/alerts/{alert.pk}/acknowledge/', {'reason': 'Rechecked, white coat.'},
                                    format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        from product.alerts.services import evaluate_patient

        evaluate_patient(self.patient)
        self.assertNotIn('R20', self.alerts(status='open'))
        self.examine(bp1_systolic=152, bp1_diastolic=96)
        self.assertIn('R20', self.alerts(status='open'))

    def test_rules_check_a_vital_or_a_lab_test_not_both(self):
        rules = '/api/product/content/alert-rules/'
        r20 = AlertRule.objects.get(organization=self.clinic, code='R20')
        both = self.client.patch(f'{rules}{r20.pk}/', {'lab_test_code': 'ferritin'}, format='json')
        self.assertEqual(both.status_code, status.HTTP_400_BAD_REQUEST)
        never = self.client.patch(f'{rules}{r20.pk}/', {'lab_check': 'never_measured'}, format='json')
        self.assertEqual(never.status_code, status.HTTP_400_BAD_REQUEST)

    def test_existing_rules_are_linked_to_examinations_by_the_data_migration(self):
        rule = AlertRule.objects.get(organization=self.clinic, code='R21')
        AlertRuleVersion.objects.filter(rule=rule).update(vital='', lab_check='')
        import_module('product.content.migrations.0007_link_starter_vital_rules').link(django_apps, None)
        current = rule.current
        self.assertEqual((current.number, current.vital, current.lab_check), (2, 'bmi', 'gte'))
