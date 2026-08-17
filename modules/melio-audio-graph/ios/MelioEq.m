#import "MelioEq.h"

#include <math.h>
#include <string.h>

#import <AVFoundation/AVFoundation.h>
#import <AudioToolbox/AudioToolbox.h>
#import <MediaToolbox/MediaToolbox.h>
#import <objc/runtime.h>

enum { kMelioEqBands = 10 };

static const float kMelioEqHz[kMelioEqBands] = {
  32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
};

static float gGainsDb[kMelioEqBands];
static char kMelioEqKVO;
static const void *kMelioEqAttacherKey = &kMelioEqAttacherKey;

typedef struct {
  MTAudioProcessingTapRef tap;
  AudioUnit eq;
  Float64 sampleTime;
  Boolean supported;
  Boolean alive;
  float lastGains[kMelioEqBands];
} MelioEqTapContext;

static Boolean MelioEqActive(const float *gains) {
  for (int i = 0; i < kMelioEqBands; i += 1) {
    if (fabsf(gains[i]) > 0.05f) return true;
  }
  return false;
}

static void MelioEqCopyGains(float *out) {
  memcpy(out, gGainsDb, sizeof(gGainsDb));
}

static OSStatus MelioEqRenderCallback(
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
  MelioEqTapContext *ctx = inRefCon;
  if (!ctx || !ctx->alive || !ctx->tap || !ioData) return kAudio_ParamError;
  return MTAudioProcessingTapGetSourceAudio(ctx->tap, inNumberFrames, ioData, NULL, NULL, NULL);
}

static void MelioEqConfigureBands(AudioUnit eq) {
  for (UInt32 band = 0; band < kMelioEqBands; band += 1) {
    AudioUnitSetParameter(eq, kAUNBandEQParam_BypassBand + band, kAudioUnitScope_Global, 0, 0, 0);
    AudioUnitParameterID type = kAUNBandEQParam_FilterType + band;
    if (band == 0) {
      AudioUnitSetParameter(eq, type, kAudioUnitScope_Global, 0, kAUNBandEQFilterType_LowShelf, 0);
    } else if (band == kMelioEqBands - 1) {
      AudioUnitSetParameter(eq, type, kAudioUnitScope_Global, 0, kAUNBandEQFilterType_HighShelf, 0);
    } else {
      AudioUnitSetParameter(eq, type, kAudioUnitScope_Global, 0, kAUNBandEQFilterType_Parametric, 0);
      AudioUnitSetParameter(eq, kAUNBandEQParam_Bandwidth + band, kAudioUnitScope_Global, 0, 1.0, 0);
    }
    AudioUnitSetParameter(eq, kAUNBandEQParam_Frequency + band, kAudioUnitScope_Global, 0, kMelioEqHz[band], 0);
  }
}

static void MelioEqApplyGains(AudioUnit eq, const float *gains, float *last) {
  for (int band = 0; band < kMelioEqBands; band += 1) {
    if (fabsf(last[band] - gains[band]) < 0.01f) continue;
    AudioUnitSetParameter(eq, kAUNBandEQParam_Gain + (AudioUnitParameterID)band, kAudioUnitScope_Global, 0, gains[band], 0);
    last[band] = gains[band];
  }
}

static void MelioEqTapInit(MTAudioProcessingTapRef tap, void *clientInfo, void **tapStorageOut) {
  (void)clientInfo;
  MelioEqTapContext *ctx = calloc(1, sizeof(MelioEqTapContext));
  if (!ctx) {
    *tapStorageOut = NULL;
    return;
  }
  ctx->tap = tap;
  ctx->alive = true;
  for (int i = 0; i < kMelioEqBands; i += 1) ctx->lastGains[i] = NAN;
  *tapStorageOut = ctx;
}

static void MelioEqDisposeUnit(MelioEqTapContext *ctx) {
  if (!ctx || !ctx->eq) return;
  AudioUnitUninitialize(ctx->eq);
  AudioComponentInstanceDispose(ctx->eq);
  ctx->eq = NULL;
}

static void MelioEqTapFinalize(MTAudioProcessingTapRef tap) {
  MelioEqTapContext *ctx = (MelioEqTapContext *)MTAudioProcessingTapGetStorage(tap);
  if (!ctx) return;
  ctx->alive = false;
  MelioEqDisposeUnit(ctx);
  free(ctx);
}

static void MelioEqTapPrepare(
  MTAudioProcessingTapRef tap,
  CMItemCount maxFrames,
  const AudioStreamBasicDescription *format
) {
  MelioEqTapContext *ctx = (MelioEqTapContext *)MTAudioProcessingTapGetStorage(tap);
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
  UInt32 bands = kMelioEqBands;
  AudioUnitSetProperty(ctx->eq, kAudioUnitProperty_MaximumFramesPerSlice, kAudioUnitScope_Global, 0, &maxSlice, sizeof(maxSlice));
  AudioUnitSetProperty(ctx->eq, kAUNBandEQProperty_NumberOfBands, kAudioUnitScope_Global, 0, &bands, sizeof(bands));
  AudioUnitSetProperty(ctx->eq, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Input, 0, format, sizeof(*format));
  AudioUnitSetProperty(ctx->eq, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Output, 0, format, sizeof(*format));
  AURenderCallbackStruct callback = {.inputProc = MelioEqRenderCallback, .inputProcRefCon = ctx};
  AudioUnitSetProperty(ctx->eq, kAudioUnitProperty_SetRenderCallback, kAudioUnitScope_Input, 0, &callback, sizeof(callback));
  if (AudioUnitInitialize(ctx->eq) != noErr) {
    AudioComponentInstanceDispose(ctx->eq);
    ctx->eq = NULL;
    ctx->supported = false;
    return;
  }
  MelioEqConfigureBands(ctx->eq);
}

static void MelioEqTapUnprepare(MTAudioProcessingTapRef tap) {
  MelioEqDisposeUnit((MelioEqTapContext *)MTAudioProcessingTapGetStorage(tap));
}

static void MelioEqTapProcess(
  MTAudioProcessingTapRef tap,
  CMItemCount numberFrames,
  MTAudioProcessingTapFlags flags,
  AudioBufferList *bufferListInOut,
  CMItemCount *numberFramesOut,
  MTAudioProcessingTapFlags *flagsOut
) {
  (void)flags;
  MelioEqTapContext *ctx = (MelioEqTapContext *)MTAudioProcessingTapGetStorage(tap);
  float gains[kMelioEqBands];
  MelioEqCopyGains(gains);
  Boolean useEq = ctx && ctx->alive && ctx->supported && ctx->eq && MelioEqActive(gains);
  if (!useEq) {
    MTAudioProcessingTapGetSourceAudio(tap, numberFrames, bufferListInOut, flagsOut, NULL, numberFramesOut);
    return;
  }

  MelioEqApplyGains(ctx->eq, gains, ctx->lastGains);
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

static AVAssetTrack *MelioEqAudioTrack(AVPlayerItem *item) {
  if (!item) return nil;
  for (AVPlayerItemTrack *track in item.tracks) {
    if ([track.assetTrack.mediaType isEqualToString:AVMediaTypeAudio]) return track.assetTrack;
  }
  return [item.asset tracksWithMediaType:AVMediaTypeAudio].firstObject;
}

@interface MelioEqAttacher : NSObject
- (instancetype)initWithPlayer:(AVPlayer *)player;
- (void)refresh;
@end

@implementation MelioEqAttacher {
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
  [_observedItem removeObserver:self forKeyPath:@"status" context:&kMelioEqKVO];
  [_observedItem removeObserver:self forKeyPath:@"tracks" context:&kMelioEqKVO];
  _observedItem = nil;
}

- (void)bindItem:(AVPlayerItem *)item {
  if (_observedItem == item) return;
  [self unbindItem];
  _observedItem = item;
  if (!item) return;
  [item addObserver:self forKeyPath:@"status" options:NSKeyValueObservingOptionNew context:&kMelioEqKVO];
  [item addObserver:self forKeyPath:@"tracks" options:NSKeyValueObservingOptionNew context:&kMelioEqKVO];
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
  if (context != &kMelioEqKVO) return;
  [self refresh];
}

- (void)installIfPossible {
  AVPlayerItem *item = _player.currentItem;
  float gains[kMelioEqBands];
  MelioEqCopyGains(gains);
  if (!item || !MelioEqActive(gains)) {
    _installedItem.audioMix = nil;
    _installedItem = nil;
    return;
  }
  if (_installedItem == item && item.audioMix) return;
  AVAssetTrack *track = MelioEqAudioTrack(item);
  if (!track) return;

  AVMutableAudioMixInputParameters *params = [AVMutableAudioMixInputParameters audioMixInputParametersWithTrack:track];
  AVMutableAudioMix *mix = [AVMutableAudioMix audioMix];
  if (!params || !mix) return;

  MTAudioProcessingTapCallbacks callbacks = {
    .version = kMTAudioProcessingTapCallbacksVersion_0,
    .clientInfo = NULL,
    .init = MelioEqTapInit,
    .finalize = MelioEqTapFinalize,
    .prepare = MelioEqTapPrepare,
    .unprepare = MelioEqTapUnprepare,
    .process = MelioEqTapProcess,
  };
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

@interface AVPlayer (MelioEq)
- (void)melio_replaceCurrentItemWithItem:(AVPlayerItem *)item;
@end

@interface MelioEq ()
- (void)writeGains:(const float *)next;
- (void)refreshAttached;
@end

@implementation MelioEq {
  NSHashTable<AVPlayer *> *_players;
}

+ (void)load {
  Method orig = class_getInstanceMethod([AVPlayer class], @selector(replaceCurrentItemWithItem:));
  Method alt = class_getInstanceMethod([AVPlayer class], @selector(melio_replaceCurrentItemWithItem:));
  if (orig && alt) method_exchangeImplementations(orig, alt);
}

+ (instancetype)shared {
  static MelioEq *instance;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    instance = [[MelioEq alloc] init];
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
  Boolean was = MelioEqActive(gGainsDb);
  memcpy(gGainsDb, next, sizeof(gGainsDb));
  if (was != MelioEqActive(gGainsDb)) [self refreshAttached];
}

- (void)setGainsDb:(NSArray<NSNumber *> *)gains {
  float next[kMelioEqBands];
  memset(next, 0, sizeof(next));
  NSUInteger count = MIN(gains.count, (NSUInteger)kMelioEqBands);
  for (NSUInteger i = 0; i < count; i += 1) {
    float value = gains[i].floatValue;
    if (!isfinite(value)) value = 0;
    next[i] = MAX(-24, MIN(24, value));
  }
  [self writeGains:next];
}

- (void)reset {
  float zeros[kMelioEqBands];
  memset(zeros, 0, sizeof(zeros));
  [self writeGains:zeros];
}

- (void)refreshAttached {
  void (^work)(void) = ^{
    for (AVPlayer *player in self->_players) {
      MelioEqAttacher *attacher = objc_getAssociatedObject(player, kMelioEqAttacherKey);
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
  MelioEqAttacher *attacher = objc_getAssociatedObject(player, kMelioEqAttacherKey);
  if (!attacher) {
    attacher = [[MelioEqAttacher alloc] initWithPlayer:player];
    objc_setAssociatedObject(player, kMelioEqAttacherKey, attacher, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  }
  [attacher refresh];
}

@end

@implementation AVPlayer (MelioEq)

- (void)melio_replaceCurrentItemWithItem:(AVPlayerItem *)item {
  [self melio_replaceCurrentItemWithItem:item];
  [[MelioEq shared] attachToPlayer:self];
}

@end
