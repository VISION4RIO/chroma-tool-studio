declare module "parse-dds" {
  type DdsFormat = "dxt1" | "dxt3" | "dxt5" | "rgba32f";

  type DdsImage = {
    offset: number;
    length: number;
    shape: [number, number];
  };

  type DdsInfo = {
    shape: [number, number];
    images: DdsImage[];
    format: DdsFormat;
    flags: number;
    cubemap: boolean;
  };

  export default function parseDds(buffer: ArrayBuffer): DdsInfo;
}

declare module "dxt-js" {
  const dxt: {
    compress: (inputData: Uint8Array, width: number, height: number, flags: number) => Uint8Array;
    decompress: (inputData: Uint8Array, width: number, height: number, flags: number) => Uint8Array;
    flags: {
      DXT1: number;
      DXT3: number;
      DXT5: number;
      ColourIterativeClusterFit: number;
      ColourClusterFit: number;
      ColourRangeFit: number;
      ColourMetricPerceptual: number;
      ColourMetricUniform: number;
      WeightColourByAlpha: number;
    };
  };

  export default dxt;
}