#include <node.h>

#ifdef _WIN32
#include <Windows.h>
#else
#error Satisfactory only supports Windows, so other OSs are not yet supported by SatisfactoryModLauncher
#endif

#include <filesystem>

#ifdef _WIN32
const std::filesystem::path SML_1_X_RELATIVE_PATH = std::filesystem::path("FactoryGame") / "Binaries" / "Win64" / "xinput1_3.dll";
const std::filesystem::path SML_2_X_RELATIVE_PATH = std::filesystem::path("loaders") / "UE4-SML-Win64-Shipping.dll";
#endif

void GetSMLVersion(const v8::FunctionCallbackInfo<v8::Value>& args)
{
  v8::Isolate* isolate = args.GetIsolate();
  v8::String::Utf8Value arg0(isolate, args[0]);
  std::filesystem::path satisfactoryPath = std::string(*arg0);
  std::string smlVersion;
  bool smlFound = false;

  std::filesystem::path fullSML_1_x_path = satisfactoryPath / SML_1_X_RELATIVE_PATH;
  std::filesystem::path fullSML_2_x_path = satisfactoryPath / SML_2_X_RELATIVE_PATH;

#ifdef _WIN32
  #ifdef UNICODE
  HMODULE dll = LoadLibraryEx(fullSML_1_x_path.wstring().c_str(), NULL, DONT_RESOLVE_DLL_REFERENCES);
  #else
  HMODULE dll = LoadLibraryEx(fullSML_1_x_path.string().c_str(), NULL, DONT_RESOLVE_DLL_REFERENCES);
  #endif
  if (GetLastError() == 0) {
    char* smlDllVersion = (char*) GetProcAddress(dll, "smlVersion");
    if (smlDllVersion) {
      smlVersion = std::string(smlDllVersion);
      smlFound = true;
    }
    FreeLibrary(dll);
  } 
  if (!smlFound) {
    // TODO: SML 2.0 doesn't export its version yet
  }
#else
    // TODO: Other OSs
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