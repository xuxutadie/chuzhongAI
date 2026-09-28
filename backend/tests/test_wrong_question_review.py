import unittest
from datetime import date
from app.services.wrong_question_review import daily_limit,next_review_date


class ReviewTests(unittest.TestCase):
    def test_limits_and_intervals(self):
        self.assertEqual([daily_limit(x) for x in (None,5,20,90)],[2,1,2,3])
        self.assertEqual(next_review_date(date(2026,9,25),0),date(2026,9,26))
        self.assertEqual(next_review_date(date(2026,9,26),1),date(2026,9,29))
        self.assertEqual(next_review_date(date(2026,9,29),2),date(2026,10,6))
        self.assertIsNone(next_review_date(date(2026,10,6),3))
