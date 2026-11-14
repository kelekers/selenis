import unittest

import numpy as np
from build_south_hemisphere import sample_overview


class HemisphereTests(unittest.TestCase):
    def test_periodic_seam_and_single_pole(self):
        heights = np.array([[0, 10, 20, 30], [100, 110, 120, 130]], dtype=float)
        grid = sample_overview(heights, 5, 3)
        np.testing.assert_array_equal(grid[:, 0], grid[:, -1])
        np.testing.assert_array_equal(grid[-1], [115] * 5)
        self.assertEqual(grid[0, 0], 15)
        self.assertEqual(grid[0, 1], 5)
        self.assertEqual(grid[1, 1], 55)

    def test_constant_elevation_and_invalid_input(self):
        np.testing.assert_array_equal(sample_overview(np.full((4, 8), -500.5)), -500.5)
        for heights in [np.ones(4), np.array([[0, np.nan], [1, 2]])]:
            with self.assertRaises(ValueError):
                sample_overview(heights)
        with self.assertRaises(ValueError):
            sample_overview(np.ones((4, 8)), width=2000)


if __name__ == "__main__":
    unittest.main()
