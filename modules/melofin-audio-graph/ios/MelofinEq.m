#import "MelofinEq.h"

#include <math.h>
#include <string.h>

#import <AVFoundation/AVFoundation.h>
#import <AudioToolbox/AudioToolbox.h>
#import <MediaToolbox/MediaToolbox.h>
#import <objc/runtime.h>

enum { kMelofinEqBands = 10 };

static const float kMelofinEqHz[kMelofinEqBands] = {
  32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
};

static float gGainsDb[kMelofinEqBands];
static char kMelofinEqKVO;
static const void *kMelofinEqAttacherKey = &kMelofinEqAttacherKey;

typedef struct {
  MTAudioProcessingTapRef tap;
  AudioUnit eq;
  Float64 sampleTime;
  Boolean supported;
  Boolean alive;
  float lastGains[kMelofinEqBands];
} MelofinEqTapContext;

static Boolean MelofinEqActive(const float *gains) {
  for (int i = 0; i < kMelofinEqBands; i += 1) {
    if (fabsf(gains[i]) > 0.05f) return true;
  }
  return false;
}

static void MelofinEqCopyGains(float *out) {
  memcpy(out, gGainsDb, sizeof(gGainsDb));
}

static OSStatus MelofinEqRenderCallback(
  void *inRefCon,
  AudioUnitRenderActionFlags *ioActionFlags,
  const AudioTimeStamp *inTimeStamp,
  UInt32 inBusNumber,
  UInt32 inNumberFrames,
  AudioBufferList *ioData
) {
  (void)ioActionFlags;
  (void)inTimeStamp;
  (void)inBusNumber;
  MelofinEqTapContext *ctx = inRefCon;
  if (!ctx || !ctx->alive || !ctx->tap || !ioData) return kAudio_ParamError;
  return MTAudioProcessingTapGetSourceAudio(ctx->tap, inNumberFrames, ioData, NULL, NULL, NULL);
}

static void MelofinEqConfigureBands(AudioUnit eq) {
  for (UInt32 band = 0; band < kMelofinEqBands; band += 1) {
    AudioUnitSetParameter(eq, kAUNBandEQParam_BypassBand + band, kAudioUnitScope_Global, 0, 0, 0);
    AudioUnitParameterID type = kAUNBandEQParam_FilterType + band;
    if (band == 0) {
      AudioUnitSetParameter(eq, type, kAudioUnitScope_Global, 0, kAUNBandEQFilterType_LowShelf, 0);
    } else if (band == kMelofinEqBands - 1) {
      AudioUnitSetParameter(eq, type, kAudioUnitScope_Global, 0, kAUNBandEQFilterType_HighShelf, 0);
    } else {
      AudioUnitSetParameter(eq, type, kAudioUnitScope_Global, 0, kAUNBandEQFilterType_Parametric, 0);
      AudioUnitSetParameter(eq, kAUNBandEQParam_Bandwidth + band, kAudioUnitScope_Global, 0, 1.0, 0);
    }
    AudioUnitSetParameter(eq, kAUNBandEQParam_Frequency + band, kAudioUnitScope_Global, 0, kMelofinEqHz[band], 0);
  }
}

static void MelofinEqApplyGains(AudioUnit eq, const float *gains, float *last) {
  for (int band = 0; band < kMelofinEqBands; band += 1) {
    if (fabsf(last[band] - gains[band]) < 0.01f) continue;
    AudioUnitSetParameter(eq, kAUNBandEQParam_Gain + (AudioUnitParameterID)band, kAudioUnitScope_Global, 0, gains[band], 0);
    last[band] = gains[band];
  }
}

static void MelofinEqTapInit(MTAudioProcessingTapRef tap, void *clientInfo, void **tapStorageOut) {
  (void)clientInfo;
  MelofinEqTapContext *ctx = calloc(1, sizeof(MelofinEqTapContext));
  if (!ctx) {
    *tapStorageOut = NULL;
    return;
  }
  ctx->tap = tap;
  ctx->alive = true;
  for (int i = 0; i < kMelofinEqBands; i += 1) ctx->lastGains[i] = NAN;
  *tapStorageOut = ctx;
}

static void MelofinEqDisposeUnit(MelofinEqTapContext *ctx) {
  if (!ctx || !ctx->eq) return;
  AudioUnitUninitialize(ctx->eq);
  AudioComponentInstanceDispose(ctx->eq);
  ctx->eq = NULL;
}

static void MelofinEqTapFinalize(MTAudioProcessingTapRef tap) {
  MelofinEqTapContext *ctx = (MelofinEqTapContext *)MTAudioProcessingTapGetStorage(tap);
  if (!ctx) return;
  ctx->alive = false;
  MelofinEqDisposeUnit(ctx);
  free(ctx);
}

static void MelofinEqTapPrepare(
  MTAudioProcessingTapRef tap,
  CMItemCount maxFrames,
  const AudioStreamBasicDescription *format
) {
  MelofinEqTapContext *ctx = (MelofinEqTapContext *)MTAudioProcessingTapGetStorage(tap);
  if (!ctx || !format) return;
  ctx->supported =
    format->mFormatID == kAudioFormatLinearPCM &&
    (format->mFormatFlags & kAudioFormatFlagIsFloat);
  if (!ctx->supported) return;

  AudioComponentDescription desc = {
    .componentType = kAudioUnitType_Effect,
    .componentSubType = kAudioUnitSubType_NBandEQ,
    .componentManufacturer = kAudioUnitManufacturer_Apple,
  };
  AudioComponent component = AudioComponentFindNext(NULL, &desc);
  if (!component || AudioComponentInstanceNew(component, &ctx->eq) != noErr) {
    ctx->supported = false;
    return;
  }

  UInt32 maxSlice = (UInt32)maxFrames;
  UInt32 bands = kMelofinEqBands;
  AudioUnitSetProperty(ctx->eq, kAudioUnitProperty_MaximumFramesPerSlice, kAudioUnitScope_Global, 0, &maxSlice, sizeof(maxSlice));
  AudioUnitSetProperty(ctx->eq, kAUNBandEQProperty_NumberOfBands, kAudioUnitScope_Global, 0, &bands, sizeof(bands));
  AudioUnitSetProperty(ctx->eq, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Input, 0, format, sizeof(*format));
  AudioUnitSetProperty(ctx->eq, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Output, 0, format, sizeof(*format));
  AURenderCallbackStruct callback = {.inputProc = MelofinEqRenderCallback, .inputProcRefCon = ctx};
  AudioUnitSetProperty(ctx->eq, kAudioUnitProperty_SetRenderCallback, kAudioUnitScope_Input, 0, &callback, sizeof(callback));
  if (AudioUnitInitialize(ctx->eq) != noErr) {
    AudioComponentInstanceDispose(ctx->eq);
    ctx->eq = NULL;
    ctx->supported = false;
    return;
  }
  MelofinEqConfigureBands(ctx->eq);
}

static void MelofinEqTapUnprepare(MTAudioProcessingTapRef tap) {
  MelofinEqDisposeUnit((MelofinEqTapContext *)MTAudioProcessingTapGetStorage(tap));
}

static void MelofinEqTapProcess(
  MTAudioProcessingTapRef tap,
  CMItemCount numberFrames,
  MTAudioProcessingTapFlags flags,
  AudioBufferList *bufferListInOut,
  CMItemCount *numberFramesOut,
  MTAudioProcessingTapFlags *flagsOut
) {
  (void)flags;
  MelofinEqTapContext *ctx = (MelofinEqTapContext *)MTAudioProcessingTapGetStorage(tap);
  float gains[kMelofinEqBands];
  MelofinEqCopyGains(gains);
  Boolean useEq = ctx && ctx->alive && ctx->supported && ctx->eq && MelofinEqActive(gains);
  if (!useEq) {
    MTAudioProcessingTapGetSourceAudio(tap, numberFrames, bufferListInOut, flagsOut, NULL, numberFramesOut);
    return;
  }

  MelofinEqApplyGains(ctx->eq, gains, ctx->lastGains);
  AudioTimeStamp timestamp = {0};
  timestamp.mSampleTime = ctx->sampleTime;
  timestamp.mFlags = kAudioTimeStampSampleTimeValid;
  ctx->sampleTime += numberFrames;
  AudioUnitRenderActionFlags actionFlags = 0;
  if (AudioUnitRender(ctx->eq, &actionFlags, &timestamp, 0, (UInt32)numberFrames, bufferListInOut) != noErr) {
    MTAudioProcessingTapGetSourceAudio(tap, numberFrames, bufferListInOut, flagsOut, NULL, numberFramesOut);
    return;
  }
  if (numberFramesOut) *numberFramesOut = numberFrames;
  if (flagsOut) *flagsOut = 0;
}

static AVAssetTrack *MelofinEqAudioTrack(AVPlayerItem *item) {
  if (!item) return nil;
  for (AVPlayerItemTrack *track in item.tracks) {
    if ([track.assetTrack.mediaType isEqualToString:AVMediaTypeAudio]) return track.assetTrack;
  }
  return [item.asset tracksWithMediaType:AVMediaTypeAudio].firstObject;
}

@interface MelofinEqAttacher : NSObject
- (instancetype)initWithPlayer:(AVPlayer *)player;
- (void)refresh;
@end

@implementation MelofinEqAttacher {
  __weak AVPlayer *_player;
  AVPlayerItem *_observedItem;
  AVPlayerItem *_installedItem;
}

- (instancetype)initWithPlayer:(AVPlayer *)player {
  self = [super init];
  if (!self) return nil;
  _player = player;
  return self;
}

- (void)dealloc {
  [self unbindItem];
  _installedItem.audioMix = nil;
}

- (void)unbindItem {
  if (!_observedItem) return;
  [_observedItem removeObserver:self forKeyPath:@"status" context:&kMelofinEqKVO];
  [_observedItem removeObserver:self forKeyPath:@"tracks" context:&kMelofinEqKVO];
  _observedItem = nil;
}

- (void)bindItem:(AVPlayerItem *)item {
  if (_observedItem == item) return;
  [self unbindItem];
  _observedItem = item;
  if (!item) return;
  [item addObserver:self forKeyPath:@"status" options:NSKeyValueObservingOptionNew context:&kMelofinEqKVO];
  [item addObserver:self forKeyPath:@"tracks" options:NSKeyValueObservingOptionNew context:&kMelofinEqKVO];
}

- (void)refresh {
  if (![NSThread isMainThread]) {
    dispatch_async(dispatch_get_main_queue(), ^{ [self refresh]; });
    return;
  }
  AVPlayer *player = _player;
  if (!player) return;
  [self bindItem:player.currentItem];
  [self installIfPossible];
}

- (void)observeValueForKeyPath:(NSString *)keyPath
                      ofObject:(id)object
                        change:(NSDictionary<NSKeyValueChangeKey, id> *)change
                       context:(void *)context {
  (void)keyPath;
  (void)object;
  (void)change;
  if (context != &kMelofinEqKVO) return;
  [self refresh];
}

- (void)installIfPossible {
  AVPlayerItem *item = _player.currentItem;
  float gains[kMelofinEqBands];
  MelofinEqCopyGains(gains);
  if (!item || !MelofinEqActive(gains)) {
    _installedItem.audioMix = nil;
    _installedItem = nil;
    return;
  }
  if (_installedItem == item && item.audioMix) return;
  AVAssetTrack *track = MelofinEqAudioTrack(item);
  if (!track) return;

  AVMutableAudioMixInputParameters *params = [AVMutableAudioMixInputParameters audioMixInputParametersWithTrack:track];
  AVMutableAudioMix *mix = [AVMutableAudioMix audioMix];
  if (!params || !mix) return;

  MTAudioProcessingTapCallbacks callbacks;
  memset(&callbacks, 0, sizeof(callbacks));
  callbacks.version = kMTAudioProcessingTapCallbacksVersion_0;
  callbacks.clientInfo = NULL;
  callbacks.init = MelofinEqTapInit;
  callbacks.finalize = MelofinEqTapFinalize;
  callbacks.prepare = MelofinEqTapPrepare;
  callbacks.unprepare = MelofinEqTapUnprepare;
  callbacks.process = MelofinEqTapProcess;
  MTAudioProcessingTapRef tap = NULL;
  if (MTAudioProcessingTapCreate(kCFAllocatorDefault, &callbacks, kMTAudioProcessingTapCreationFlag_PostEffects, &tap) != noErr || !tap) {
    return;
  }
  params.audioTapProcessor = tap;
  mix.inputParameters = @[params];
  item.audioMix = mix;
  _installedItem = item;
  CFRelease(tap);
}

@end

@interface AVPlayer (MelofinEq)
- (void)replaceCurrentItemWithItem:(AVPlayerItem *)item;
- (void)melofin_replaceCurrentItemWithItem:(AVPlayerItem *)item;
@end

@interface MelofinEq ()
- (void)writeGains:(const float *)next;
- (void)refreshAttached;
@end

@implementation MelofinEq {
  NSHashTable<AVPlayer *> *_players;
}

+ (void)load {
  Method orig = class_getInstanceMethod([AVPlayer class], @selector(replaceCurrentItemWithItem:));
  Method alt = class_getInstanceMethod([AVPlayer class], @selector(melofin_replaceCurrentItemWithItem:));
  if (orig && alt) method_exchangeImplementations(orig, alt);
}

+ (instancetype)shared {
  static MelofinEq *instance;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    instance = [[MelofinEq alloc] init];
  });
  return instance;
}

- (instancetype)init {
  self = [super init];
  if (!self) return nil;
  _players = [NSHashTable weakObjectsHashTable];
  return self;
}

- (void)writeGains:(const float *)next {
  Boolean was = MelofinEqActive(gGainsDb);
  memcpy(gGainsDb, next, sizeof(gGainsDb));
  if (was != MelofinEqActive(gGainsDb)) [self refreshAttached];
}

- (void)setGainsDb:(NSArray<NSNumber *> *)gains {
  float next[kMelofinEqBands];
  memset(next, 0, sizeof(next));
  NSUInteger count = MIN(gains.count, (NSUInteger)kMelofinEqBands);
  for (NSUInteger i = 0; i < count; i += 1) {
    float value = gains[i].floatValue;
    if (!isfinite(value)) value = 0;
    next[i] = MAX(-24, MIN(24, value));
  }
  [self writeGains:next];
}

- (void)reset {
  float zeros[kMelofinEqBands];
  memset(zeros, 0, sizeof(zeros));
  [self writeGains:zeros];
}

- (void)refreshAttached {
  void (^work)(void) = ^{
    for (AVPlayer *player in self->_players) {
      MelofinEqAttacher *attacher = objc_getAssociatedObject(player, kMelofinEqAttacherKey);
      [attacher refresh];
    }
  };
  if ([NSThread isMainThread]) work();
  else dispatch_async(dispatch_get_main_queue(), work);
}

- (void)attachToPlayer:(AVPlayer *)player {
  if (!player) return;
  if (![NSThread isMainThread]) {
    dispatch_async(dispatch_get_main_queue(), ^{ [self attachToPlayer:player]; });
    return;
  }
  [_players addObject:player];
  MelofinEqAttacher *attacher = objc_getAssociatedObject(player, kMelofinEqAttacherKey);
  if (!attacher) {
    attacher = [[MelofinEqAttacher alloc] initWithPlayer:player];
    objc_setAssociatedObject(player, kMelofinEqAttacherKey, attacher, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  }
  [attacher refresh];
}

@end

@implementation AVPlayer (MelofinEq)

- (void)melofin_replaceCurrentItemWithItem:(AVPlayerItem *)item {
  [self melofin_replaceCurrentItemWithItem:item];
  [[MelofinEq shared] attachToPlayer:self];
}

@end
