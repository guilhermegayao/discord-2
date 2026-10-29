// Captura o som do PC, MENOS o de um processo e seus filhos (o próprio app).
//
// Usa a captura "por processo" do Windows (Windows 11 / build 20348+):
// ActivateAudioInterfaceAsync no dispositivo virtual de loopback com
// PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE. Assim a voz da chamada,
// que toca dentro do app, não volta para quem assiste a transmissão (sem eco).
//
// Do lado do JavaScript:
//   const cap = new LoopbackCapture(pid, onEvent);
//   cap.start();   // onEvent(Float32Array): áudio 48 kHz, estéreo, intercalado
//                  // onEvent(null, mensagem): a captura falhou e parou
//   cap.stop();
//
// A captura roda numa thread própria; os pedaços chegam ao JS por uma
// ThreadSafeFunction (a única forma segura de chamar JS de outra thread).

#include <napi.h>

#include <windows.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <mmdeviceapi.h>
#include <wrl/implements.h>

#include <atomic>
#include <string>
#include <thread>
#include <vector>

using Microsoft::WRL::ClassicCom;
using Microsoft::WRL::ComPtr;
using Microsoft::WRL::FtmBase;
using Microsoft::WRL::Make;
using Microsoft::WRL::RuntimeClass;
using Microsoft::WRL::RuntimeClassFlags;

namespace {

constexpr UINT32 kSampleRate = 48000;
constexpr UINT16 kChannels = 2;
// 20 ms de buffer no Windows (em unidades de 100 ns).
constexpr REFERENCE_TIME kBufferDuration = 20 * 10000;

/** Recebe o resultado da ativação assíncrona do cliente de áudio. */
class ActivationHandler
    : public RuntimeClass<RuntimeClassFlags<ClassicCom>, FtmBase,
                          IActivateAudioInterfaceCompletionHandler> {
 public:
  ActivationHandler() : done_(CreateEventW(nullptr, TRUE, FALSE, nullptr)) {}
  ~ActivationHandler() override { CloseHandle(done_); }

  STDMETHOD(ActivateCompleted)(IActivateAudioInterfaceAsyncOperation* operation) override {
    HRESULT activateResult = E_FAIL;
    ComPtr<IUnknown> unknown;
    HRESULT hr = operation->GetActivateResult(&activateResult, &unknown);
    result_ = FAILED(hr) ? hr : activateResult;
    if (SUCCEEDED(result_)) result_ = unknown.As(&client_);
    SetEvent(done_);
    return S_OK;
  }

  HANDLE done() const { return done_; }
  HRESULT result() const { return result_; }
  ComPtr<IAudioClient> client() const { return client_; }

 private:
  HANDLE done_;
  HRESULT result_ = E_FAIL;
  ComPtr<IAudioClient> client_;
};

/** O que viaja da thread de captura para o JS: áudio ou uma mensagem de erro. */
struct Message {
  std::vector<float> samples;
  std::string error;
};

std::string HrMessage(const char* step, HRESULT hr) {
  char buffer[96];
  snprintf(buffer, sizeof(buffer), "%s falhou (0x%08lX)", step, static_cast<unsigned long>(hr));
  return buffer;
}

class LoopbackCapture : public Napi::ObjectWrap<LoopbackCapture> {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports) {
    Napi::Function ctor = DefineClass(env, "LoopbackCapture",
                                      {InstanceMethod("start", &LoopbackCapture::Start),
                                       InstanceMethod("stop", &LoopbackCapture::Stop)});
    exports.Set("LoopbackCapture", ctor);
    return exports;
  }

  explicit LoopbackCapture(const Napi::CallbackInfo& info)
      : Napi::ObjectWrap<LoopbackCapture>(info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsFunction()) {
      Napi::TypeError::New(env, "uso: new LoopbackCapture(pid, onEvent)")
          .ThrowAsJavaScriptException();
      return;
    }
    pid_ = info[0].As<Napi::Number>().Uint32Value();
    onEvent_ = Napi::Persistent(info[1].As<Napi::Function>());
  }

  ~LoopbackCapture() override { Shutdown(); }

 private:
  Napi::Value Start(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (worker_.joinable()) return env.Undefined();

    stopEvent_ = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    tsfn_ = Napi::ThreadSafeFunction::New(env, onEvent_.Value(), "loopback-capture", 0, 1);
    worker_ = std::thread([this] { Run(); });
    return env.Undefined();
  }

  Napi::Value Stop(const Napi::CallbackInfo& info) {
    Shutdown();
    return info.Env().Undefined();
  }

  void Shutdown() {
    if (!worker_.joinable()) return;
    SetEvent(stopEvent_);
    worker_.join();
    CloseHandle(stopEvent_);
    stopEvent_ = nullptr;
    tsfn_.Release();
  }

  // ---- Thread de captura ----

  void Run() {
    HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    if (FAILED(hr)) {
      Post({{}, HrMessage("CoInitializeEx", hr)});
      return;
    }
    std::string error = Capture();
    if (!error.empty()) Post({{}, error});
    CoUninitialize();
  }

  std::string Capture() {
    AUDIOCLIENT_ACTIVATION_PARAMS params = {};
    params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
    params.ProcessLoopbackParams.TargetProcessId = pid_;
    params.ProcessLoopbackParams.ProcessLoopbackMode =
        PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE;

    PROPVARIANT activation = {};
    activation.vt = VT_BLOB;
    activation.blob.cbSize = sizeof(params);
    activation.blob.pBlobData = reinterpret_cast<BYTE*>(&params);

    ComPtr<ActivationHandler> handler = Make<ActivationHandler>();
    ComPtr<IActivateAudioInterfaceAsyncOperation> operation;
    HRESULT hr = ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
                                             __uuidof(IAudioClient), &activation,
                                             handler.Get(), &operation);
    if (FAILED(hr)) return HrMessage("ActivateAudioInterfaceAsync", hr);

    HANDLE activationWaits[2] = {handler->done(), stopEvent_};
    if (WaitForMultipleObjects(2, activationWaits, FALSE, INFINITE) != WAIT_OBJECT_0) return {};
    if (FAILED(handler->result())) return HrMessage("Ativação do áudio", handler->result());
    ComPtr<IAudioClient> client = handler->client();

    // PCM 16 bits é o formato que a captura por processo aceita com certeza;
    // convertemos para float aqui mesmo.
    WAVEFORMATEX format = {};
    format.wFormatTag = WAVE_FORMAT_PCM;
    format.nChannels = kChannels;
    format.nSamplesPerSec = kSampleRate;
    format.wBitsPerSample = 16;
    format.nBlockAlign = format.nChannels * format.wBitsPerSample / 8;
    format.nAvgBytesPerSec = format.nSamplesPerSec * format.nBlockAlign;

    hr = client->Initialize(AUDCLNT_SHAREMODE_SHARED,
                            AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK |
                                AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
                            kBufferDuration, 0, &format, nullptr);
    if (FAILED(hr)) return HrMessage("IAudioClient::Initialize", hr);

    HANDLE ready = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    hr = client->SetEventHandle(ready);
    ComPtr<IAudioCaptureClient> capture;
    if (SUCCEEDED(hr)) hr = client->GetService(IID_PPV_ARGS(&capture));
    if (SUCCEEDED(hr)) hr = client->Start();
    if (FAILED(hr)) {
      CloseHandle(ready);
      return HrMessage("Início da captura", hr);
    }

    std::string error;
    HANDLE waits[2] = {ready, stopEvent_};
    while (error.empty() && WaitForMultipleObjects(2, waits, FALSE, INFINITE) == WAIT_OBJECT_0) {
      UINT32 packetFrames = 0;
      while (SUCCEEDED(hr = capture->GetNextPacketSize(&packetFrames)) && packetFrames > 0) {
        BYTE* data = nullptr;
        UINT32 frames = 0;
        DWORD flags = 0;
        hr = capture->GetBuffer(&data, &frames, &flags, nullptr, nullptr);
        if (FAILED(hr)) break;

        std::vector<float> samples(static_cast<size_t>(frames) * kChannels, 0.0f);
        if (!(flags & AUDCLNT_BUFFERFLAGS_SILENT)) {
          const int16_t* pcm = reinterpret_cast<const int16_t*>(data);
          for (size_t i = 0; i < samples.size(); ++i) samples[i] = pcm[i] / 32768.0f;
        }
        capture->ReleaseBuffer(frames);
        Post({std::move(samples), {}});
      }
      if (FAILED(hr)) error = HrMessage("Leitura do áudio", hr);
    }

    client->Stop();
    CloseHandle(ready);
    return error;
  }

  /**
   * Manda para o JS sem bloquear a thread de captura. O callback não usa
   * `this`: mensagens na fila podem ser entregues depois do objeto sumir.
   */
  void Post(Message message) {
    auto* payload = new Message(std::move(message));
    napi_status status = tsfn_.NonBlockingCall(
        payload, [](Napi::Env env, Napi::Function onEvent, Message* msg) {
          if (msg->error.empty()) {
            auto array = Napi::Float32Array::New(env, msg->samples.size());
            std::copy(msg->samples.begin(), msg->samples.end(), array.Data());
            onEvent.Call({array});
          } else {
            onEvent.Call({env.Null(), Napi::String::New(env, msg->error)});
          }
          delete msg;
        });
    if (status != napi_ok) delete payload;
  }

  uint32_t pid_ = 0;
  Napi::FunctionReference onEvent_;
  Napi::ThreadSafeFunction tsfn_;
  HANDLE stopEvent_ = nullptr;
  std::thread worker_;
};

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  return LoopbackCapture::Init(env, exports);
}

}  // namespace

NODE_API_MODULE(loopback, Init)
