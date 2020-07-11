#include <node.h>

#include "autoFilesystem.h"
#include "crossPlatformSymbol.hpp"

void GetBootstrapperVersion(const v8::FunctionCallbackInfo<v8::Value>& args) {
  v8::Isolate* isolate = args.GetIsolate();
  v8::String::Utf8Value arg0(isolate, args[0]);
  std::filesystem::path bootstrapperPath = std::string(*arg0);
  std::string bootstrapperVersion;

  bool bootstrapperFound = GetCrossPlatformSymbolWchar(bootstrapperPath, "bootstrapperVersion", bootstrapperVersion);

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