import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { colors, fontSize, radius, spacing } from '../theme/tokens';
import { Mono } from './text';

type ShowToast = (message: string) => void;

const ToastContext = createContext<ShowToast>(() => {});

/** Transient bottom-center confirmation, auto-dismiss ~1.9s. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback<ShowToast>(
    (msg) => {
      if (timer.current) clearTimeout(timer.current);
      setMessage(msg);
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 240, useNativeDriver: true }).start(() => setMessage(null));
      }, 1900);
    },
    [opacity]
  );

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {message !== null && (
        <Animated.View style={[styles.toast, { opacity }]} pointerEvents="none">
          <Mono size={fontSize.listMeta} color={colors.textPrimary}>
            {message}
          </Mono>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 96,
    alignSelf: 'center',
    maxWidth: '86%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceConsole,
  },
});
