import tempfile
import unittest
from pathlib import Path

from mapbox_config import load_mapbox_token


class MapboxConfigurationTests(unittest.TestCase):
    def test_prefers_explicit_server_token(self):
        with tempfile.TemporaryDirectory() as temporary:
            dotenv = Path(temporary) / ".env.local"
            dotenv.write_text("NEXT_PUBLIC_MAPBOX_TOKEN=public-token\n", encoding="utf-8")

            token = load_mapbox_token(
                environment={"MAPBOX_TOKEN": "server-token"}, dotenv_path=dotenv
            )

            self.assertEqual(token, "server-token")

    def test_reads_next_public_token_from_web_dotenv_for_offline_build_scripts(self):
        with tempfile.TemporaryDirectory() as temporary:
            dotenv = Path(temporary) / ".env.local"
            dotenv.write_text(
                "# Shared with Next.js\nNEXT_PUBLIC_MAPBOX_TOKEN=\"public-token\"\n",
                encoding="utf-8",
            )

            token = load_mapbox_token(environment={}, dotenv_path=dotenv)

            self.assertEqual(token, "public-token")


if __name__ == "__main__":
    unittest.main()
