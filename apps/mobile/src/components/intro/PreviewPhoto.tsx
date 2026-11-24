import { Image, StyleSheet } from 'react-native';

// A bundled Image supplies its own dimensions. Let Yoga resolve both dimensions
// from the four edges of the unpadded, rounded parent, including at large text sizes.
export function PreviewPhoto({ testID }: { testID: string }) {
  return <Image testID={testID} accessible={false} source={require('../../../assets/first-run/dusk.webp')}
    resizeMode="cover" style={[StyleSheet.absoluteFill, styles.photo]} />;
}

const styles = StyleSheet.create({ photo: { width: 'auto', height: 'auto' } });
