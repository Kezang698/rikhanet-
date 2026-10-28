"use client";

import { Heading } from "@/components/ui";
import { ElephantInference } from "@/components/ElephantInference";

export default function WebcamPage() {
  return (
    <>
      <Heading
        title="Webcam"
        description="Capture a frame or upload an image to detect elephants with the local best.pt model."
      />
      <ElephantInference />
    </>
  );
}
