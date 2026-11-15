import io
import unittest

import numpy as np
from build_context import encode_heightmap
from build_local_regions import block_roughness
from PIL import Image


class LocalRegionTests(unittest.TestCase):
    def test_context_heightmap_is_lossless_and_metric(self):
        values = np.array([[-100, -99.9], [1000, 5000]], dtype=float)
        payload, encoding = encode_heightmap(values)
        image = np.asarray(Image.open(io.BytesIO(payload))).astype(np.uint16)
        decoded = (image[..., 0] * 256 + image[..., 1]) * encoding["meters_per_unit"]
        decoded += encoding["offset_m"]
        np.testing.assert_allclose(decoded, values, atol=encoding["meters_per_unit"] / 2)
        self.assertEqual(encoding["packing"], "RG_MSB_LSB")
        self.assertFalse(encoding["lossy"])
        with self.assertRaises(ValueError):
            encode_heightmap(np.array([[np.nan]]))

    def test_tilted_planes_have_zero_detrended_roughness(self):
        row, col = np.mgrid[:40, :40]
        result = block_roughness(2000 + row * 5 + col * 2.5, 5)
        np.testing.assert_allclose(result, np.zeros((2, 2)), atol=1e-10)

    def test_known_residual_is_measured_in_metres(self):
        row, col = np.mgrid[:40, :40]
        result = block_roughness(2000 + row * 5 + col * 2.5 + 2 * (-1.0) ** (row + col), 5)
        np.testing.assert_allclose(result, np.full((2, 2), 2), atol=1e-10)

    def test_missing_or_partial_footprints_are_rejected(self):
        for data in [np.ones((21, 20)), np.full((20, 20), np.nan)]:
            with self.assertRaises(ValueError):
                block_roughness(data, 5)


if __name__ == "__main__":
    unittest.main()
