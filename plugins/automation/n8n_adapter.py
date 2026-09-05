"""
n8n Thin Automation Adapter for Sandora

Provides minimal, low-coupling integration with a local or remote n8n instance:
1. health: Check if n8n is running (GET /healthz or /healthz/readiness).
2. open workflow: Open workflow editor in default browser (GET /workflow/:id).
3. run workflow: Trigger workflow execution via webhook (POST /webhook/:path) or REST API.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
import webbrowser
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

DEFAULT_N8N_URL = os.environ.get("N8N_BASE_URL", "http://127.0.0.1:5678")


class N8nAdapter:
    """Thin adapter for n8n automation runtime."""

    def __init__(self, base_url: str = DEFAULT_N8N_URL, api_key: Optional[str] = None):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key or os.environ.get("N8N_API_KEY")

    def check_health(self, timeout_seconds: float = 3.0) -> Dict[str, Any]:
        """
        Check if n8n instance is reachable and ready.
        Target: GET /healthz or GET /healthz/readiness
        """
        endpoints = [f"{self.base_url}/healthz/readiness", f"{self.base_url}/healthz"]
        for url in endpoints:
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Sandora-n8n-Adapter/1.0"})
                with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
                    status_code = resp.getcode()
                    if status_code in (200, 204):
                        body = resp.read().decode("utf-8")
                        try:
                            data = json.loads(body) if body else {"status": "ok"}
                        except Exception:
                            data = {"status": "ok", "raw": body}
                        return {
                            "online": True,
                            "status_code": status_code,
                            "endpoint": url,
                            "data": data,
                        }
            except urllib.error.HTTPError as e:
                # Some versions of n8n return 200 without JSON
                if e.code in (200, 204):
                    return {"online": True, "status_code": e.code, "endpoint": url}
                continue
            except Exception as e:
                logger.debug("n8n health check failed for %s: %s", url, e)
                continue

        return {
            "online": False,
            "error": "n8n runtime unreachable at " + self.base_url,
            "base_url": self.base_url,
        }

    def get_workflow_editor_url(self, workflow_id: str) -> str:
        """Get the web URL to view and edit a workflow in n8n UI."""
        return f"{self.base_url}/workflow/{workflow_id}"

    def open_workflow_editor(self, workflow_id: str) -> bool:
        """Open the workflow editor in the user's default browser."""
        url = self.get_workflow_editor_url(workflow_id)
        try:
            return webbrowser.open(url)
        except Exception as e:
            logger.error("Failed to open browser for workflow %s: %s", workflow_id, e)
            return False

    def trigger_webhook(
        self,
        path: str,
        payload: Optional[Dict[str, Any]] = None,
        is_test: bool = False,
        timeout_seconds: float = 30.0,
    ) -> Dict[str, Any]:
        """
        Trigger an n8n workflow via its Webhook node.
        URL format: POST /webhook/<path> or POST /webhook-test/<path>
        """
        clean_path = path.lstrip("/")
        prefix = "webhook-test" if is_test else "webhook"
        url = f"{self.base_url}/{prefix}/{clean_path}"

        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Sandora-Automation/1.0",
        }
        if self.api_key:
            headers["X-N8N-API-KEY"] = self.api_key

        body_bytes = json.dumps(payload or {}).encode("utf-8")
        req = urllib.request.Request(url, data=body_bytes, headers=headers, method="POST")

        try:
            with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
                status_code = resp.getcode()
                resp_text = resp.read().decode("utf-8")
                try:
                    result_data = json.loads(resp_text) if resp_text else {}
                except Exception:
                    result_data = {"raw": resp_text}

                return {
                    "success": True,
                    "status_code": status_code,
                    "url": url,
                    "result": result_data,
                }
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8") if e.fp else ""
            return {
                "success": False,
                "status_code": e.code,
                "error": f"HTTP {e.code}: {e.reason}",
                "detail": err_body,
                "url": url,
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "url": url,
            }

    def trigger_workflow_api(
        self,
        workflow_id: str,
        data: Optional[Dict[str, Any]] = None,
        timeout_seconds: float = 30.0,
    ) -> Dict[str, Any]:
        """
        Trigger workflow execution via n8n REST API (requires API key).
        Target: POST /api/v1/workflows/:id/run
        """
        url = f"{self.base_url}/api/v1/workflows/{workflow_id}/run"
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Sandora-Automation/1.0",
        }
        if self.api_key:
            headers["X-N8N-API-KEY"] = self.api_key

        body_bytes = json.dumps(data or {}).encode("utf-8")
        req = urllib.request.Request(url, data=body_bytes, headers=headers, method="POST")

        try:
            with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
                status_code = resp.getcode()
                resp_text = resp.read().decode("utf-8")
                try:
                    result_data = json.loads(resp_text) if resp_text else {}
                except Exception:
                    result_data = {"raw": resp_text}

                return {
                    "success": True,
                    "status_code": status_code,
                    "workflow_id": workflow_id,
                    "result": result_data,
                }
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8") if e.fp else ""
            return {
                "success": False,
                "status_code": e.code,
                "error": f"HTTP {e.code}: {e.reason}",
                "detail": err_body,
                "workflow_id": workflow_id,
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "workflow_id": workflow_id,
            }


# Default singleton instance
default_adapter = N8nAdapter()
