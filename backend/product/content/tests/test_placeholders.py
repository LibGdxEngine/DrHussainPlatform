from django.test import SimpleTestCase

from product.content.placeholders import render, validate_text


class ValidateTextTests(SimpleTestCase):
    def test_known_placeholders_and_blanks_are_fine(self):
        self.assertEqual(validate_text('Dear {{patient.first_name}}, repeat in [[repeat interval]]. {{prescription}}'), [])

    def test_unknown_placeholder(self):
        self.assertEqual(validate_text('Hi {{patient.nickname}}'), ['Unknown placeholder: {{patient.nickname}}.'])

    def test_unclosed_and_empty(self):
        self.assertIn('A {{placeholder}} is not closed.', validate_text('Hi {{patient.first_name'))
        self.assertIn('A [[blank]] is not closed.', validate_text('Repeat in [[interval'))
        self.assertIn('A [[blank]] needs a label, e.g. [[repeat interval]].', validate_text('Dose [[ ]]'))


class RenderTests(SimpleTestCase):
    def test_fills_known_values_and_lists_what_the_doctor_still_fills(self):
        result = render(
            'Dear {{patient.first_name}}, phone {{clinic.phone}}. {{prescription}} Repeat in [[repeat interval]].',
            {'patient.first_name': 'Laila'},
        )
        self.assertEqual(
            result.text,
            'Dear Laila, phone [[clinic.phone (not available)]]. [[prescription]] Repeat in [[repeat interval]].',
        )
        self.assertEqual(result.open_slots, ['clinic.phone (not available)', 'prescription', 'repeat interval'])

    def test_nothing_open(self):
        self.assertEqual(render('Dear {{patient.first_name}}', {'patient.first_name': 'Nour'}).open_slots, [])
