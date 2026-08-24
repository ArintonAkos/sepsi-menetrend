import unittest

from build_route_audit import render_route


class RouteAuditTests(unittest.TestCase):
    def test_marks_each_repeated_stop_as_a_separate_pass(self):
        direction = {
            "line": "3", "direction": "depart",
            "headsign": {"ro": "Circular", "hu": "Körjárat"},
            "stops": [
                {"name": {"ro": "Coșeni 1", "hu": "Szotyor 1"}},
                {"name": {"ro": "Coșeni 2", "hu": "Szotyor 2"}},
                {"name": {"ro": "Coșeni 1", "hu": "Szotyor 1"}},
            ],
        }

        page = render_route(direction)

        self.assertIn('data-pass="1/2"', page)
        self.assertIn('data-pass="2/2"', page)
        self.assertIn("forduló / hurok", page)


if __name__ == "__main__":
    unittest.main()
