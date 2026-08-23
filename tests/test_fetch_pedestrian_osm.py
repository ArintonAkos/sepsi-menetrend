import unittest

from fetch_pedestrian_osm import bounds_for_stops, query_for_bounds


class PedestrianExtractTests(unittest.TestCase):
    def test_expands_the_served_stop_area_and_requests_way_nodes(self):
        # The east stop represents Câmpul Frumos / Szépmező.  The graph must
        # include it plus enough surrounding road network to walk to a stop.
        bounds = bounds_for_stops([(25.7071, 45.8129), (25.841028, 45.9031)])

        self.assertLess(bounds[0], 45.80)
        self.assertGreater(bounds[2], 45.91)
        self.assertLess(bounds[1], 25.69)
        self.assertGreater(bounds[3], 25.86)

        query = query_for_bounds(bounds)
        self.assertIn('way["highway"~', query)
        self.assertIn("out body;>;out skel qt;", query)


if __name__ == "__main__":
    unittest.main()
