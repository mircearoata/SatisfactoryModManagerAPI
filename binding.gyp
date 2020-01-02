{
  "targets": [
    {
      "target_name": "smlVersion",
      "sources": [ "src/smlVersion.cpp" ],
      "cflags": [
        "-std=c++17"
      ], 
      "msvs_settings": {
        "VCCLCompilerTool": {
          "AdditionalOptions": [ "/std:c++17", ],
        },
      },
    }
  ]
}