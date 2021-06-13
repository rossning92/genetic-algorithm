export function createJsonUploader(callback: (data: any) => void) {
  const upload = document.createElement("input");
  upload.type = "file";
  document.body.append(upload);

  upload.addEventListener("change", function () {
    if (upload.files.length > 0) {
      const reader = new FileReader();

      reader.addEventListener("load", function () {
        const result = JSON.parse(reader.result as string);
        callback(result);
      });

      reader.readAsText(upload.files[0]);
    }
  });
}

export function saveAsJson(data: any, fileName: string) {
  const dataStr =
    "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data));
  const downloadAnchorNode = document.createElement("a");
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", fileName);
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
}

export function fetchJson(url: string, callback: (data: any) => void) {
  const xmlhttp = new XMLHttpRequest();
  xmlhttp.open("GET", url, true);
  xmlhttp.onreadystatechange = function () {
    if (xmlhttp.readyState == 4) {
      if (xmlhttp.status == 200) {
        const data = JSON.parse(xmlhttp.responseText);
        callback(data);
      }
    }
  };
  xmlhttp.send(null);
}
