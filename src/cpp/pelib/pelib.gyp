{
  "targets": [
    {        
      "target_name": "pelib", 
      'type': 'static_library',
      'include_dirs': [
        'include',
      ],
      'sources': [
        'src/pelib/BoundImportDirectory.cpp',
        'src/pelib/CMakeLists.txt',
        'src/pelib/CoffSymbolTable.cpp',
        'src/pelib/ComHeaderDirectory.cpp',
        'src/pelib/DebugDirectory.cpp',
        'src/pelib/ExportDirectory.cpp',
        'src/pelib/IatDirectory.cpp',
        'src/pelib/InputBuffer.cpp',
        'src/pelib/MzHeader.cpp',
        'src/pelib/OutputBuffer.cpp',
        'src/pelib/PeFile.cpp',
        'src/pelib/PeHeader.cpp',
        'src/pelib/PeLibAux.cpp',
        'src/pelib/RelocationsDirectory.cpp',
        'src/pelib/ResourceDirectory.cpp',
        'src/pelib/RichHeader.cpp',
        'src/pelib/SecurityDirectory.cpp'
      ],
      'cflags_cc!': [ 
        '-fno-rtti'
      ]
    },
  ]
}