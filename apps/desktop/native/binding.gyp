{
  "targets": [
    {
      "target_name": "loopback",
      "sources": ["src/loopback.cc"],
      "include_dirs": ["<!(node -p \"require('node-addon-api').include_dir\")"],
      "defines": ["NAPI_VERSION=8", "NAPI_DISABLE_CPP_EXCEPTIONS", "UNICODE", "_UNICODE"],
      "libraries": ["mmdevapi.lib", "ole32.lib"],
      "msvs_settings": {
        "VCCLCompilerTool": { "ExceptionHandling": 1, "AdditionalOptions": ["/std:c++20"] }
      }
    }
  ]
}
