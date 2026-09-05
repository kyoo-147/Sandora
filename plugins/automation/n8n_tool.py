"""
Agent Tools for n8n Automation
"""

from typing import Any, Dict, Optional
from plugins.automation.n8n_adapter import N8nAdapter, default_adapter


def n8n_check_health(base_url: Optional[str] = None) -> Dict[str, Any]:
    """
    Check if the local or remote n8n automation runtime is online.
    
    Args:
        base_url: Optional n8n base URL (defaults to http://127.0.0.1:5678).
    
    Returns:
        Dictionary with 'online' status, endpoint, and response data.
    """
    adapter = N8nAdapter(base_url=base_url) if base_url else default_adapter
    return adapter.check_health()


def n8n_trigger_webhook(
    webhook_path: str,
    payload: Optional[Dict[str, Any]] = None,
    base_url: Optional[str] = None,
    is_test: bool = False,
) -> Dict[str, Any]:
    """
    Trigger an n8n workflow via its webhook path and receive the result.
    
    Args:
        webhook_path: The webhook path defined in the n8n Webhook node (e.g. "lead-qualification").
        payload: Optional data dictionary to send to the workflow.
        base_url: Optional n8n base URL.
        is_test: Set to True to trigger test webhook (/webhook-test/...).
        
    Returns:
        Dictionary with success status, status code, and execution result.
    """
    adapter = N8nAdapter(base_url=base_url) if base_url else default_adapter
    return adapter.trigger_webhook(path=webhook_path, payload=payload, is_test=is_test)


def n8n_open_editor(workflow_id: str, base_url: Optional[str] = None) -> Dict[str, Any]:
    """
    Open the n8n visual workflow editor in the user's browser for advanced editing.
    
    Args:
        workflow_id: The ID of the workflow to open.
        base_url: Optional n8n base URL.
        
    Returns:
        Dictionary with url and whether browser was successfully opened.
    """
    adapter = N8nAdapter(base_url=base_url) if base_url else default_adapter
    url = adapter.get_workflow_editor_url(workflow_id)
    opened = adapter.open_workflow_editor(workflow_id)
    return {"url": url, "opened": opened}
