import { deviceNameFor, MAX_DEVICE_NAME } from './deviceName';

describe('deviceNameFor', () => {
  it('names iPhones and iPads', () => {
    expect(deviceNameFor('ios', { interfaceIdiom: 'phone' })).toBe('iPhone · ViSiON/3 QWK Mobile');
    expect(deviceNameFor('ios', { interfaceIdiom: 'pad' })).toBe('iPad · ViSiON/3 QWK Mobile');
  });

  it('uses brand + model on Android without repeating the brand', () => {
    expect(deviceNameFor('android', { Brand: 'samsung', Model: 'SM-S921B' })).toBe('Samsung SM-S921B · ViSiON/3 QWK Mobile');
    expect(deviceNameFor('android', { Brand: 'google', Model: 'Google Pixel 8' })).toBe('Google Pixel 8 · ViSiON/3 QWK Mobile');
    expect(deviceNameFor('android')).toBe('Android phone · ViSiON/3 QWK Mobile');
  });

  it('stays within the server limit', () => {
    const long = deviceNameFor('android', { Brand: 'x'.repeat(50), Model: 'y'.repeat(50) });
    expect(long.length).toBeLessThanOrEqual(MAX_DEVICE_NAME);
  });
});
