#include "autoFilesystem.h"

#include "pelib/PeLib.h"
#ifdef __linux__
#include <dlfcn.h>
#endif

std::string wcharToString(wchar_t *str)
{
  char charValue[50];
  std::wcstombs(charValue, str, 50);
  return std::string(charValue);
}

bool GetSymbolOffset(std::filesystem::path dllPath, const std::string symbol, uint64_t &offset)
{
  PeLib::PeFile64 *file = new PeLib::PeFile64(dllPath.string());
  file->readMzHeader();
  file->readPeHeader();
  file->readExportDirectory();
  int functionIndex = file->expDir().getFunctionIndex(symbol);
  if (functionIndex == -1)
    return false;
  auto addressOfFunction = file->expDir().getAddressOfFunction(functionIndex);
  auto functionOffset = file->peHeader().rvaToOffset(addressOfFunction);
  std::ifstream fileStream(dllPath.string(), std::ios_base::binary);
  fileStream.seekg(functionOffset, std::ios_base::beg);
  uint64_t valueVa = -1;
  fileStream.read(reinterpret_cast<char *>(&valueVa), sizeof(valueVa));
  auto valueOffset = file->peHeader().vaToOffset(valueVa);
  offset = valueOffset;
  delete file;
  return true;
}

bool GetDLLSymbolWchar(std::filesystem::path dllPath, const std::string symbol, std::string &value)
{
  uint64_t offset = -1;
  bool symbolExists = GetSymbolOffset(dllPath, symbol, offset);
  if (!symbolExists)
    return false;
  std::ifstream fileStream(dllPath.string(), std::ios_base::binary);
  fileStream.seekg(offset, std::ios_base::beg);
  wchar_t ch;
  value = "";
  while (fileStream.read(reinterpret_cast<char *>(&ch), sizeof(ch)) && ch)
    value += ch;
  return true;
}

#ifdef __linux__
bool GetSOSymbolWchar(std::filesystem::path soPath, const std::string symbol, std::string &value)
{
  bool success = false;
  void *lib = dlopen(soPath.string().c_str(), RTLD_LAZY);
  if (lib)
  {
    wchar_t **wcharValue = (wchar_t **)dlsym(lib, symbol.c_str());
    if (wcharValue)
    {
      success = true;
      value = wcharToString(*wcharValue);
    }
    dlclose(lib);
  }
  return success;
}
#endif

bool GetCrossPlatformSymbolWchar(std::filesystem::path path, const std::string symbol, std::string &value)
{
  if (path.extension().string() == ".dll")
  { // why is extension a path... ?
    return GetDLLSymbolWchar(path, symbol, value);
  }
#ifdef __linux__
  if (path.extension().string() == ".so")
  {
    return GetSOSymbolWchar(path, symbol, value);
  }
#endif
  return false;
}