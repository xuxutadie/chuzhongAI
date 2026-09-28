import unittest
from app.services.wrong_question_practice import build_verified_question, advance_practice
from app.services.question_evidence import grade_answer


class PracticeTests(unittest.TestCase):
    def test_complement_sector_explanation_uses_complement_and_360(self):
        q=build_verified_question('percentage',{'part':5,'total':20},'challenge')
        self.assertEqual(q['answer'],'270')
        self.assertIn('20-5',q['explanation'])
        self.assertIn('360',q['explanation'])
    def test_two_distinct_independent_variants_required(self):
        state={'stage':'variant','independent_hashes':[],'consecutive_errors':0}
        first=advance_practice(state,'correct',True,'a','variant')
        self.assertEqual(first['stage'],'variant')
        repeated=advance_practice(first,'correct',True,'a','variant')
        self.assertEqual(repeated['stage'],'variant')
        self.assertEqual(advance_practice(repeated,'correct',True,'b','variant')['stage'],'extension')

    def test_hints_errors_and_optional_challenge(self):
        state={'stage':'understanding'}
        self.assertEqual(advance_practice(state,'correct',False,'a','understanding')['stage'],'understanding')
        wrong=advance_practice(state,'wrong',True,'a','understanding')
        wrong=advance_practice(wrong,'wrong',True,'b','understanding')
        self.assertTrue(wrong['needs_help'])
        state={'stage':'review'}
        self.assertEqual(advance_practice(state,'wrong',True,'a','challenge'),state)

    def test_statistical_figure_matches_data(self):
        q=build_verified_question('percentage',{'part':10,'total':40},'variant')
        self.assertEqual(q['answer'],'25')
        self.assertEqual(q['diagram']['elements'][0]['endAngle'],0)
        self.assertNotIn('25%',q['diagram']['alt'])
        with self.assertRaises(ValueError):
            build_verified_question('percentage',{'part':10,'total':0},'variant')

    def test_integer_negative_and_fraction(self):
        self.assertEqual(build_verified_question('integer_add',{'a':2,'b':-7},'variant')['answer'],'-5')
        self.assertEqual(build_verified_question('fraction_add',{'a':2,'b':3},'variant')['answer'],'5/6')
        with self.assertRaises(ValueError):
            build_verified_question('arbitrary_html',{},'challenge')

    def test_numeric_equivalence_without_execution(self):
        q={'answer':'1/2','response_type':'numeric'}
        self.assertEqual(grade_answer(q,'0.5'),'correct')
        self.assertEqual(grade_answer(q,'__import__("os")'),'wrong')
