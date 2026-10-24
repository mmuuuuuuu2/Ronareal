// Stub next/image UNTUK HARNESS: <img> biasa yang menunjuk ke berkas ikon asli di public/.
export default function Image({ src, alt, width, height, priority, ...rest }: any) {
  return <img src={"file:///home/claude/rona/public" + src} alt={alt} width={width} height={height} {...rest} />;
}
