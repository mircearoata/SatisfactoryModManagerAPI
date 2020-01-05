{
  "targets": [
    {
      "target_name": "smlVersion",
      "sources": [ "src/smlVersion.cpp" ],
      "cflags": [
        "-std=c++17"
      ],
      "cflags_cc!": [
        "-std=c++17", "-lstdc++fs", "-Wno-cast-function-type"
      ],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "AdditionalOptions": [ "/std:c++17", ],
        },
      },
    }
  ]
}