from __future__ import annotations

import sys
import time
from pathlib import Path

import uno
from com.sun.star.beans import PropertyValue


def prop(name, value):
    item = PropertyValue()
    item.Name = name
    item.Value = value
    return item


def to_url(path: Path) -> str:
    return uno.systemPathToFileUrl(str(path.resolve()))


def connect():
    local_ctx = uno.getComponentContext()
    resolver = local_ctx.ServiceManager.createInstanceWithContext(
        "com.sun.star.bridge.UnoUrlResolver", local_ctx
    )
    last_error = None
    for _ in range(30):
        try:
            return resolver.resolve(
                "uno:socket,host=127.0.0.1,port=2002;urp;StarOffice.ComponentContext"
            )
        except Exception as exc:
            last_error = exc
            time.sleep(0.25)
    raise RuntimeError(f"No fue posible conectar con LibreOffice: {last_error}")


def render(pdf_path: Path, output_dir: Path):
    output_dir.mkdir(parents=True, exist_ok=True)
    context = connect()
    services = context.ServiceManager
    desktop = services.createInstanceWithContext("com.sun.star.frame.Desktop", context)
    document = desktop.loadComponentFromURL(
        to_url(pdf_path),
        "_blank",
        0,
        (prop("Hidden", True), prop("ReadOnly", True)),
    )
    if document is None:
        raise RuntimeError("LibreOffice no pudo abrir el PDF.")

    pages = document.getDrawPages()
    count = pages.getCount()
    for index in range(count):
        page = pages.getByIndex(index)
        exporter = services.createInstanceWithContext(
            "com.sun.star.drawing.GraphicExportFilter", context
        )
        exporter.setSourceDocument(page)
        output = output_dir / f"page-{index + 1:02d}.png"
        exporter.filter(
            (
                prop("URL", to_url(output)),
                prop("MediaType", "image/png"),
                prop("FilterName", "PNG"),
            )
        )
    document.close(True)
    print(count)


if __name__ == "__main__":
    render(Path(sys.argv[1]), Path(sys.argv[2]))
