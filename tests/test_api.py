import json
import threading
import unittest
from urllib.request import urlopen

from app.main import create_server
from app.simulator import build_snapshot


class TelemetryTests(unittest.TestCase):
    def test_simulated_snapshot_contains_dashboard_data(self) -> None:
        snapshot = build_snapshot().to_dict()

        self.assertEqual(snapshot["mission"]["name"], "Rooftop Plant A")
        self.assertEqual(snapshot["mission"]["state"], "in_progress")
        self.assertEqual(snapshot["vehicle"]["drone_id"], "SPCD-001")
        self.assertEqual(snapshot["battery"]["percent"], 76)
        self.assertTrue(snapshot["cleaning"]["pump_on"])
        self.assertEqual(snapshot["links"]["rc"]["status"], "Strong")
        self.assertGreaterEqual(len(snapshot["alerts"]), 1)


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = create_server(port=0)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def get_json(self, path: str) -> dict:
        with urlopen(f"http://127.0.0.1:{self.port}{path}", timeout=2) as response:
            self.assertEqual(response.status, 200)
            return json.loads(response.read().decode("utf-8"))

    def test_health_endpoint_reports_ok(self) -> None:
        self.assertEqual(self.get_json("/api/health"), {"status": "ok", "service": "solar-ui"})

    def test_telemetry_endpoint_returns_dashboard_snapshot(self) -> None:
        payload = self.get_json("/api/telemetry")

        self.assertEqual(payload["mission"]["name"], "Rooftop Plant A")
        self.assertEqual(payload["cleaning"]["active_zone"], "Zone 3")


if __name__ == "__main__":
    unittest.main()
