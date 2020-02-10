{
  'conditions': [
    ['OS=="linux"', {
      'targets': [
        {
          'target_name': 'smlVersion',
          'sources': ['src/cpp/smlVersion.cpp'],
          'link_settings': {
            'libraries': ['-lstdc++fs']
          },
          'cflags': [
            '-std=c++17'
          ],
          'cflags_cc': [
            '-std=c++17', '-lstdc++fs', '-Wno-cast-function-type'
          ]
        },
        {
          'target_name': 'bootstrapperVersion',
          'sources': ['src/cpp/bootstrapperVersion.cpp'],
          'link_settings': {
            'libraries': ['-lstdc++fs']
          },
          'cflags': [
            '-std=c++17'
          ],
          'cflags_cc': [
            '-std=c++17', '-lstdc++fs', '-Wno-cast-function-type'
          ]
        }
      ]
    }],
    ['OS == "win"', {
      'targets': [
        {
          'target_name': 'smlVersion',
          'sources': ['src/cpp/smlVersion.cpp'],
          'msvs_settings': {
            'VCCLCompilerTool': {
              'AdditionalOptions': ['/std:c++17']
            }
          }
        },
        {
          'target_name': 'bootstrapperVersion',
          'sources': ['src/cpp/bootstrapperVersion.cpp'],
          'msvs_settings': {
            'VCCLCompilerTool': {
              'AdditionalOptions': ['/std:c++17']
            }
          }
        }
      ]
    }]
  ]
}
