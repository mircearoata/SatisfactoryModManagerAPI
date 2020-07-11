#include <node.h>
#include "autoFilesystem.h"
#include "crossPlatformSymbol.hpp"

void GetSMLVersion(const v8::FunctionCallbackInfo<v8::Value>& args) {
  v8::Isolate* isolate = args.GetIsolate();
  v8::String::Utf8Value arg0(isolate, args[0]);
  std::filesystem::path smlPath = std::string(*arg0);
  std::string smlVersion;
  
  bool smlFound = GetCrossPlatformSymbolWchar(smlPath, "modLoaderVersionString", smlVersion);

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