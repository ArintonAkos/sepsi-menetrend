import unittest

from build_walking_graph import build_graph


class WalkingGraphBuildTests(unittest.TestCase):
    def test_keeps_the_paved_detour_and_excludes_a_private_shortcut(self):
        osm = {
            "elements": [
                {"type": "node", "id": 1, "lat": 45.8600, "lon": 25.7600},
                {"type": "node", "id": 2, "lat": 45.8600, "lon": 25.7610},
                {"type": "node", "id": 3, "lat": 45.8610, "lon": 25.7610},
                {"type": "node", "id": 4, "lat": 45.8610, "lon": 25.7600},
                {"type": "way", "id": 10, "nodes": [1, 2, 3, 4],
                 "tags": {"highway": "footway"}},
                {"type": "way", "id": 11, "nodes": [1, 4],
                 "tags": {"highway": "path", "access": "private"}},
            ],
        }
        graph = build_graph(osm)

        self.assertEqual(graph["version"], 1)
        self.assertEqual(graph["vertices"], [[25.76, 45.86], [25.761, 45.86],
                                                [25.761, 45.861], [25.76, 45.861]])
        self.assertEqual(graph["edges"], [[1], [0, 2], [1, 3], [2]])
        self.assertEqual(len(graph["metres"]), 4)
        self.assertAlmostEqual(graph["metres"][0][0], 77, delta=2)
        self.assertAlmostEqual(graph["metres"][1][1], 111, delta=2)

    def test_honours_pedestrian_direction_tags(self):
        osm = {
            "elements": [
                {"type": "node", "id": 1, "lat": 45.86, "lon": 25.76},
                {"type": "node", "id": 2, "lat": 45.86, "lon": 25.761},
                {"type": "way", "id": 10, "nodes": [1, 2],
                 "tags": {"highway": "footway", "oneway:foot": "yes"}},
            ],
        }

        graph = build_graph(osm)

        self.assertEqual(graph["edges"], [[1], []])
        self.assertEqual(len(graph["metres"][0]), 1)


if __name__ == "__main__":
    unittest.main()
