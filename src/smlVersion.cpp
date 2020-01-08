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
#include <filesystem>

#ifdef _WIN32
const std::filesystem::path SML_1_X_RELATIVE_PATH = std::filesystem::path("FactoryGame") / "Binaries" / "Win64" / "xinput1_3.dll";
const std::filesystem::path SML_2_X_RELATIVE_PATH = std::filesystem::path("loaders") / "UE4-SML-Win64-Shipping.dll";

const std::map<std::string, std::string> knownSMLHashes = {  
	{"v1.0.0-pr1", "af8f291c9f9534fb0972e976d9e87807126ec7976fd1eb32af9438e34cb0316d"},
	{"v1.0.0-pr2", "ce0e923f44623626dc500138bf400f030f2175765f7dd33aa84b9611bf36ca1b"},
	{"v1.0.0-pr3", "424a347308da025e99d6210ba6379a0487bdd01561423f071044574799aa65e6"},
	{"v1.0.0-pr4", "251d2798fc3d143f6cfd5bc9c73a37d8663add2ce4f57f6d8f19512ef8c8df65"},
	{"v1.0.0-pr5", "ac09dc25d32bc00a7bd9da4bc9bd10cc4d49229088c1d32de91fcdf24639ed87"},
	{"v1.0.0-pr6", "c2bef7b4cda4b7e268741e68e59ea737642f18316379632b52b7ba5d1e140855"},
	{"v1.0.0-pr7", "66e1fc34e08eba6920cbbe1eff8e8948821ca916383b790e6e1b18417cba6e1d"},
	{"1.0.0",      "29ce7f569ae30c62758adf4dead521b1b16433192f280ab62b59fd8f6dc0e8c7"},
	{"1.0.1",      "d15894a93db6a14d3c036a9e0f1da5d6e4b97e94f25374305b7ffdbcd3a5ebd9"}
};

std::string hashFile(std::filesystem::path filePath) {
    std::ifstream file(filePath.string().c_str(), std::ios::binary);
    
    return picosha2::hash256_hex_string(std::istreambuf_iterator<char>(file), std::istreambuf_iterator<char>());
}
#elif __linux__
const std::filesystem::path SML_2_X_RELATIVE_PATH = std::filesystem::path("loaders") / "UE4-SML-Win64-Shipping.so"; // TODO: Probably wrong
#endif

void GetSMLVersion(const v8::FunctionCallbackInfo<v8::Value>& args) {
  v8::Isolate* isolate = args.GetIsolate();
  v8::String::Utf8Value arg0(isolate, args[0]);
  std::filesystem::path satisfactoryPath = std::string(*arg0);
  std::string smlVersion;
  bool smlFound = false;

#ifdef _WIN32
  std::filesystem::path fullSML_1_x_path = satisfactoryPath / SML_1_X_RELATIVE_PATH;
  std::filesystem::path fullSML_2_x_path = satisfactoryPath / SML_2_X_RELATIVE_PATH;
  #ifdef UNICODE
  HMODULE dll = LoadLibraryEx(fullSML_1_x_path.wstring().c_str(), NULL, DONT_RESOLVE_DLL_REFERENCES);
  #else
  HMODULE dll = LoadLibraryEx(fullSML_1_x_path.string().c_str(), NULL, DONT_RESOLVE_DLL_REFERENCES);
  #endif
  if (GetLastError() == 0) {
    // get the dll exported SML version
    char* smlDllVersion = (char*) GetProcAddress(dll, "smlVersion");
    if (smlDllVersion) {
      smlVersion = std::string(smlDllVersion);
      smlFound = true;
    }
    FreeLibrary(dll);

    // check against known versions hashes
    std::string smlHash = hashFile(fullSML_1_x_path);
    for(auto knownSMLHash : knownSMLHashes) {
      if(knownSMLHash.second == smlHash) {
        smlVersion = knownSMLHash.first;
        smlFound = true;
        break;
      }
    }
  } 
  if (!smlFound) {
    // TODO: SML 2.0 doesn't export its version yet
  }
#elif __linux__
  // TODO: SML 2.0 doesn't export its version yet. This was tested on a dummy lib
  std::filesystem::path fullSML_2_x_path = satisfactoryPath / SML_2_X_RELATIVE_PATH;
  void* smlLib = dlopen(fullSML_2_x_path.c_str(), RTLD_LAZY);
  void* smlLibVersion = dlsym(smlLib, "smlVersion");
  if (smlLibVersion) {
    smlVersion = std::string((char*)smlLibVersion);
    smlFound = true;
  }
#endif

  if (smlFound) {
    args.GetReturnValue().Set(v8::String::NewFromUtf8(isolate, smlVersion.c_str(), v8::NewStringType::kNormal).ToLocalChecked());
  } else {
    args.GetReturnValue().SetUndefined();
  }
}

void Initialize(v8::Local<v8::Object> exports) {
  NODE_SET_METHOD(exports, "getSMLVersion", GetSMLVersion);
}

NODE_MODULE(module_name, Initialize)