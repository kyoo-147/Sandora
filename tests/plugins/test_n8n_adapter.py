"""
Unit tests for Sandora n8n Thin Automation Adapter
"""

import http.server
import json
import threading
import unittest
from plugins.automation.n8n_adapter import N8nAdapter
from plugins.automation.n8n_tool import n8n_check_health, n8n_trigger_webhook, n8n_open_editor


class MockN8nHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # suppress stdout logging in tests

    def do_GET(self):
        if self.path in ("/healthz", "/healthz/readiness"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "version": "1.0.0"}).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path.startswith("/webhook/"):
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length) if content_length > 0 else b"{}"
            payload = json.loads(body.decode("utf-8"))

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            response = {
                "message": "Workflow executed successfully",
                "received": payload,
                "executionId": "exec_12345",
            }
            self.wfile.write(json.dumps(response).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()


class TestN8nAdapter(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Start a lightweight local mock server on dynamic port
        cls.server = http.server.HTTPServer(("127.0.0.1", 0), MockN8nHandler)
        cls.port = cls.server.server_address[1]
        cls.mock_url = f"http://127.0.0.1:{cls.port}"
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def test_health_check_online(self):
        adapter = N8nAdapter(base_url=self.mock_url)
        health = adapter.check_health()
        self.assertTrue(health["online"])
        self.assertEqual(health["status_code"], 200)
        self.assertEqual(health["data"]["status"], "ok")

    def test_health_check_offline(self):
        adapter = N8nAdapter(base_url="http://127.0.0.1:59999")
        health = adapter.check_health(timeout_seconds=0.5)
        self.assertFalse(health["online"])
        self.assertIn("unreachable", health["error"])

    def test_workflow_editor_url(self):
        adapter = N8nAdapter(base_url="http://127.0.0.1:5678")
        url = adapter.get_workflow_editor_url("wf_market_research_99")
        self.assertEqual(url, "http://127.0.0.1:5678/workflow/wf_market_research_99")

    def test_trigger_webhook(self):
        adapter = N8nAdapter(base_url=self.mock_url)
        test_payload = {"task": "crawl_competitors", "query": "AI agent desktop"}
        resp = adapter.trigger_webhook(path="run-task", payload=test_payload)
        
        self.assertTrue(resp["success"])
        self.assertEqual(resp["status_code"], 200)
        self.assertEqual(resp["result"]["executionId"], "exec_12345")
        self.assertEqual(resp["result"]["received"]["task"], "crawl_competitors")

    def test_n8n_tools(self):
        # Test agent tool wrapper functions
        health = n8n_check_health(base_url=self.mock_url)
        self.assertTrue(health["online"])

        webhook_res = n8n_trigger_webhook(
            webhook_path="sync-leads",
            payload={"lead_id": 42},
            base_url=self.mock_url,
        )
        self.assertTrue(webhook_res["success"])
        self.assertEqual(webhook_res["result"]["executionId"], "exec_12345")


if __name__ == "__main__":
    unittest.main()
