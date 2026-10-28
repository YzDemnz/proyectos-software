import json
import pathlib

import bpy
from enfusion import workbench
from EnfusionBlenderTools.ebt.ebt_utils import get_workbench_connection_info

ROOT = pathlib.Path(r"E:\ArmaReforger-Modding")
connection = get_workbench_connection_info()
status = workbench.call_function(connection, "IsWorkbenchRunning", {})
assert status.get("ErrorCode") == "Ok" and status.get("ScriptsCompiled"), status
resources = {}
for name, guid in [
    ("Assets/Bridge/BridgeCube.xob", "A462F5559E57EC8A"),
    ("Assets/Bridge/Bridge_HeadTurn.anm", "D574064C8220B3EC"),
]:
    result = workbench.call_function(connection, "GetResourceInfo", {"path": name, "expandResource": False})
    assert result.get("ErrorCode") == "Ok" and result.get("status") == 0, result
    assert guid in result.get("resourceName", ""), "The wrong Workbench project is open"
    resources[name] = result["resourceName"]
report = {"blender": bpy.app.version_string, "workbench": status, "resources": resources}
(ROOT / "Bridge/health-check.json").write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
