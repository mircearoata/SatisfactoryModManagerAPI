#include "autoFilesystem.h"

#if _WIN32 || __WINE__
#include <Windows.h>
#endif
#ifdef __linux__
#include <dlfcn.h>
#endif

std::string wcharToString(wchar_t* str) {
  char charValue[50];
  std::wcstombs(charValue, str, 50);
  return std::string(charValue);
}

#if _WIN32 || __WINE__
bool GetDLLSymbolWchar(std::filesystem::path dllPath, const std::string symbol, std::string& value) {
  bool success = false;
  #ifdef UNICODE
  HMODULE dll = LoadLibraryEx(dllPath.wstring().c_str(), NULL, DONT_RESOLVE_DLL_REFERENCES);
  #else
  HMODULE dll = LoadLibraryEx(dllPath.string().c_str(), NULL, DONT_RESOLVE_DLL_REFERENCES);
  #endif
  if (GetLastError() == 0) {
    // get the dll exported SML version
    wchar_t** wcharValue = (wchar_t**) GetProcAddress(dll, symbol.c_str());
    if (wcharValue) {
      success = true;
      value = wcharToString(*wcharValue);
    }
  }
  if (dll) {
    FreeLibrary(dll);
  }
  return success;
}
#endif

#ifdef __linux__
bool GetSOSymbolWchar(std::filesystem::path soPath, const std::string symbol, std::string& value) {
  bool success = false;
  void* lib = dlopen(soPath, RTLD_LAZY);
  if(lib) {
    wchar_t** wcharValue = (wchar_t**)dlsym(smlLib, symbol);
    if (smlLibVersion) {
      success = true;
      value = wcharToString(wcharValue);
    }
    dlclose(smlLib);
  }
  return success;
}
#endif

bool GetCrossPlatformSymbolWchar(std::filesystem::path path, const std::string symbol, std::string& value) {
  bool success = false;
  #if _WIN32 || __WINE__
    if(path.extension().string() == ".dll") { // why is extension a path... ?
      success |= GetDLLSymbolWchar(path, symbol, value);
    }
  #endif
  #ifdef __linux__
    if(path.extension().string() == ".so") {
      success |= GetSOSymbolWchar(path, symbol, value); 
    }
  #endif
  return success;
}