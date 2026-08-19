#import <Foundation/Foundation.h>

@class AVPlayer;

@interface MelofinEq : NSObject

+ (instancetype)shared;
- (void)setGainsDb:(NSArray<NSNumber *> *)gains;
- (void)reset;
- (void)attachToPlayer:(AVPlayer *)player NS_SWIFT_NAME(attach(to:));

@end
