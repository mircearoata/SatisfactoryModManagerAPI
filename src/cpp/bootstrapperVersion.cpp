#include <node.h>

#ifdef _WIN32
#include <Windows.h>
#include "picosha2.h"
#elif __linux__
#include <dlfcn.h>
#else
#error Satisfactory only supports Windows, so other OSs are not yet supported by SatisfactoryModLauncher
#endif

#include <map>
#include "autoFilesystem.h"

#ifdef _WIN32
const std::filesystem::path BOOTSTRAPPER_RELATIVE_PATH = std::filesystem::path("FactoryGame") / "Binaries" / "Win64" / "xinput1_3.dll";

const std::map<std::string, std::string> knownBootstrapperHashes = {  
	{"v1.0.0", "535d285ca61f768b7b10c6c122713154fc47bb52c51bd76f2c356be301b26ee6"},
	{"v1.1.0", "eba226da37c9ef11d9e78bffbbeb5debc0549a9da96b400d970420aa304d64f1"},
	{"v1.2.0", "8c52b7291b42e246f0c60ca2b65e2499728008ee8a13a3d74f224340cd6b5e20"},
	{"v1.2.1", "556cfc594f55b39a4d8a3632c723b224ba63b6bbb21d039ac6eb3e6a487c4ac4"},
	{"v1.3.0", "772cd6ad8d9616c55d1c8db75ef9b012a8bb6ea15239da84b8484991357b6eb3"},
	{"v1.3.1", "9770c2d1f30fb63ba694ce74f449bb370dfc0de798df43356c7364bb387ca049"},
  {"v2.0.0", "12d284e8942ac19bdaa6cd665d8e8eb63349ddf0c3f26937bd6671bf0ddbbc37"},
  {"v2.0.1", "c63b7d55622c5bce4828dfe37d691801f3677a239d578fb764ff02d4a8dd44cd"}
};

std::string hashFile(std::filesystem::path filePath) {
    std::ifstream file(filePath.string().c_str(), std::ios::binary);
    
    return picosha2::hash256_hex_string(std::istreambuf_iterator<char>(file), std::istreambuf_iterator<char>());
}
#elif __linux__
const std::filesystem::path BOOTSTRAPPER_RELATIVE_PATH = std::filesystem::path("UNKNOWN"); // TODO: ???
#endif

void GetBootstrapperVersion(const v8::FunctionCallbackInfo<v8::Value>& args) {
  v8::Isolate* isolate = args.GetIsolate();
  v8::String::Utf8Value arg0(isolate, args[0]);
  std::filesystem::path satisfactoryPath = std::string(*arg0);
  std::string bootstrapperVersion;
  bool bootstrapperFound = false;

#ifdef _WIN32
  std::filesystem::path fullBootstrapperPath = satisfactoryPath / BOOTSTRAPPER_RELATIVE_PATH;
  #ifdef UNICODE
  HMODULE dll = LoadLibraryEx(fullBootstrapperPath.wstring().c_str(), NULL, DONT_RESOLVE_DLL_REFERENCES);
  #else
  HMODULE dll = LoadLibraryEx(fullBootstrapperPath.string().c_str(), NULL, DONT_RESOLVE_DLL_REFERENCES);
  #endif
  if (GetLastError() == 0) {
    // get the dll exported bootstrapper version
    wchar_t** bootstrapperDllVersion = (wchar_t**) GetProcAddress(dll, "bootstrapperVersion");
    if (bootstrapperDllVersion) {
      char bootstrapperDllVersionMB[50];
      std::wcstombs(bootstrapperDllVersionMB, *bootstrapperDllVersion, 50);
      bootstrapperVersion = std::string(bootstrapperDllVersionMB);
      bootstrapperFound = true;
    }
    FreeLibrary(dll);

    // check against known versions hashes
    std::string bootstrapper = hashFile(fullBootstrapperPath);
    for(auto knownBootstrapperHash : knownBootstrapperHashes) {
      if(knownBootstrapperHash.second == bootstrapper) {
        bootstrapperVersion = knownBootstrapperHash.first;
        bootstrapperFound = true;
        break;
      }
    }
  }
#elif __linux__
  // TODO: ???
  std::filesystem::path fullBootstrapperPath = satisfactoryPath / BOOTSTRAPPER_RELATIVE_PATH;
  void* bootstrapperLib = dlopen(fullBootstrapperPath.c_str(), RTLD_LAZY);
  void* bootstrapperLibVersion = dlsym(bootstrapperLib, "bootstrapperVersion");
  if (bootstrapperLibVersion) {
    bootstrapperVersion = std::string((char*)bootstrapperLibVersion);
    bootstrapperFound = true;
  }
#endif

  if (bootstrapperFound) {
    args.GetReturnValue().Set(v8::String::NewFromUtf8(isolate, bootstrapperVersion.c_str(), v8::NewStringType::kNormal).ToLocalChecked());
  } else {
    args.GetReturnValue().SetUndefined();
  }
}

void Initialize(v8::Local<v8::Object> exports) {
  NODE_SET_METHOD(exports, "getBootstrapperVersion", GetBootstrapperVersion);
}

NODE_MODULE(module_name, Initialize)