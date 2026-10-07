import React, {useEffect, useRef, useState} from 'react';
import {Button, StyleSheet, Text, TextInput, View} from 'react-native';
import {readDemoMessage, saveDemoMessage, type DemoMessage} from '@zephyr-demo/host-capabilities';

export default function NativeCapabilityCardView({release}: {release: 'v1' | 'v2'}): React.JSX.Element {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<DemoMessage | null>(null);
  const [state, setState] = useState<'empty' | 'saved' | 'loaded' | 'error'>('empty');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    readDemoMessage().then(value => {
      if (!mounted.current) return;
      setResult(value);
      setState(value ? 'loaded' : 'empty');
    }).catch(reason => {
      if (!mounted.current) return;
      setError(String(reason));
      setState('error');
    });
    return () => { mounted.current = false; };
  }, []);
  const run = async (action: () => Promise<DemoMessage | null>, next: 'saved' | 'loaded') => {
    setBusy(true);
    setError('');
    try {
      const value = await action();
      if (!mounted.current) return;
      setResult(value);
      setState(value ? next : 'empty');
    } catch (reason) {
      if (!mounted.current) return;
      setError(String(reason));
      setState('error');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  return <View style={styles.card} testID="native-card">
    <Text style={styles.title}>Native persistence · {release}</Text>
    <Text testID="native-card-version">{release}</Text>
    <TextInput testID="native-message-input" accessibilityLabel="Native message" style={styles.input} value={input} onChangeText={setInput} placeholder="Message to persist" editable={!busy} returnKeyType="done" />
    <View style={styles.actions}>
      <Button testID="native-save" title="Save natively" disabled={busy} onPress={() => void run(() => saveDemoMessage(input), 'saved')} />
      <Button testID="native-read" title="Read saved" disabled={busy} onPress={() => void run(readDemoMessage, 'loaded')} />
    </View>
    <Text testID="native-message-result" style={styles.result}>{result?.message ?? 'No saved message'}</Text>
    <Text testID="native-sha256" selectable style={styles.hash}>{result?.sha256 ?? 'SHA-256 unavailable'}</Text>
    <Text testID="native-state">{state}</Text>
    {!!error && <Text testID="native-error" style={styles.error}>{error}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  card: {backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, elevation: 2},
  title: {fontSize: 16, fontWeight: '700', color: '#172033', marginBottom: 6},
  input: {borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 9, marginVertical: 8, color: '#172033'},
  actions: {gap: 6},
  result: {marginTop: 10, color: '#172033', flexWrap: 'wrap'},
  hash: {fontSize: 10, color: '#475569', flexWrap: 'wrap'},
  error: {color: '#b91c1c', marginTop: 6},
});
