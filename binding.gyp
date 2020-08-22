{
  'targets': [
    {
      'target_name': 'smlVersion',
      'sources': ['src/cpp/smlVersion.cpp'],
      'include_dirs': [
        'src/cpp/pelib/include',
      ],
      'dependencies': [
        'src/cpp/pelib/pelib.gyp:pelib',
      ],
      'conditions': [
        ['OS=="linux"', {
          'link_settings': {
            'libraries': ['-lstdc++fs']
          },
          'cflags': [
            '-std=c++17'
          ],
          'cflags_cc': [
            '-std=c++17', '-lstdc++fs', '-Wno-cast-function-type'
          ],
          'cflags_cc!': [ 
            '-fno-rtti'
          ]
        }],
        ['OS == "win"', {
          'msvs_settings': {
            'VCCLCompilerTool': {
              'AdditionalOptions': ['/std:c++17']
            }
          }
        }]
      ]
    },
    {
      'target_name': 'bootstrapperVersion',
      'sources': ['src/cpp/bootstrapperVersion.cpp'],
      'include_dirs': [
        'src/cpp/pelib/include',
      ],
      'dependencies': [
        'src/cpp/pelib/pelib.gyp:pelib',
      ],
      'conditions': [
        ['OS=="linux"', {
          'link_settings': {
            'libraries': ['-lstdc++fs']
          },
          'cflags': [
            '-std=c++17'
          ],
          'cflags_cc': [
            '-std=c++17', '-lstdc++fs', '-Wno-cast-function-type'
          ],
          'cflags_cc!': [ 
            '-fno-rtti'
          ]
        }],
        ['OS == "win"', {
          'msvs_settings': {
            'VCCLCompilerTool': {
              'AdditionalOptions': ['/std:c++17']
            }
          }
        }]
      ]
    }
  ]
}
