"""
How well report lines are read, against lines whose expected reading was written by hand. A misread is
a wrong reading the doctor is NOT asked to check; there must be none.
"""
import json
import sys
from decimal import Decimal
from pathlib import Path

from django.test import TestCase

from apps.organizations.models import Organization
from product.results.catalog import Catalog
from product.results.extraction.parsing import parse_rows

CORPUS = Path(__file__).parent / 'fixtures' / 'reading_corpus.json'


def _unit(text):
    return (text or '').replace('µ', 'u').replace('μ', 'u').casefold()


def _decimal(text):
    return None if text is None else Decimal(text)


class ReadingCorpusTests(TestCase):
    def setUp(self):
        self.catalog = Catalog(Organization.objects.create(name='V-Clinic', slug='v-clinic'))

    def read(self, text):
        return parse_rows(text, lambda name: self.catalog.resolve(name) is not None, self.catalog.expected_unit)

    def differences(self, row, expected) -> list[str]:
        test = self.catalog.resolve(row.name)
        found = {'name': test.code if test else row.name, 'unit': _unit(row.unit),
                 'low': row.ref_low, 'high': row.ref_high, 'flag': row.flag}
        wanted = {'name': expected['name'], 'unit': _unit(expected['unit']),
                  'low': _decimal(expected['low']), 'high': _decimal(expected['high']), 'flag': expected.get('flag')}
        value = expected['value']
        if value[:1].isdigit() or value[:1] in '<>':
            limit = value[0] if value[0] in '<>' else ''
            found['value'] = (row.value_text[:1] if row.value_text[:1] in '<>' else '', row.value_numeric)
            wanted['value'] = (limit, Decimal(value.lstrip('<>')))
        else:
            found['value'], wanted['value'] = row.value_text, value
        if wanted['flag'] is None:
            del wanted['flag'], found['flag']
        return [f'{key}: read {found[key]!r}, expected {wanted[key]!r}' for key in wanted if found[key] != wanted[key]]

    def test_corpus_has_no_misreads(self):
        lines = json.loads(CORPUS.read_text(encoding='utf-8'))['lines']
        self.assertGreaterEqual(len(lines), 40)
        texts = [line['text'] for line in lines]
        self.assertIn('TSH 3rd generation 3.1 mIU/L 0.4 - 4.0', texts)

        correct = flagged = 0
        misread, wrong_flag = [], []
        for line in lines:
            rows, expected = self.read(line['text']), line['expected']
            if expected is None:
                if any(not (r.check_reason or r.unreadable) for r in rows):
                    misread.append(f'{line["text"]!r}: read a result from a line that has none')
                elif rows:
                    flagged += 1
                    wrong_flag.append(f'{line["text"]!r}: flagged a line that has no result')
                else:
                    correct += 1
                continue
            if len(rows) != 1:
                misread.append(f'{line["text"]!r}: read {len(rows)} results, expected 1')
                continue
            row = rows[0]
            uncertain = bool(row.check_reason or row.unreadable)
            if uncertain != expected['needs_check']:
                wrong_flag.append(f'{line["text"]!r}: needs_check {uncertain} ({row.check_reason}), '
                                  f'expected {expected["needs_check"]}')
            if uncertain:
                flagged += 1
            elif problems := self.differences(row, expected):
                misread.append(f'{line["text"]!r}: ' + '; '.join(problems))
            else:
                correct += 1

        sys.stderr.write(f'\nReading corpus: {len(lines)} lines, {correct} correct, {flagged} flagged uncertain, '
                         f'{len(misread)} misread\n')
        self.assertEqual(misread, [])
        self.assertEqual(wrong_flag, [])
        self.assertEqual(correct + flagged, len(lines))
