#!/usr/bin/env python3
import json
import os
import socket
import sys


def block_network(*args, **kwargs):
    raise RuntimeError("refused: network access disabled at SSR score time")


def main():
    if os.environ.get("HF_HUB_OFFLINE") != "1" or os.environ.get("TRANSFORMERS_OFFLINE") != "1":
        raise SystemExit("refused: HF_HUB_OFFLINE=1 and TRANSFORMERS_OFFLINE=1 are required")
    socket.create_connection = block_network
    socket.socket.connect = block_network
    socket.socket.connect_ex = block_network

    payload = json.load(sys.stdin)
    snapshot_dir = str(payload.get("snapshot_dir") or "").strip()
    model_id = str(payload.get("model_id") or "").strip()
    revision = str(payload.get("revision") or "").strip()
    texts = payload.get("texts") or []

    if not snapshot_dir or not os.path.isdir(snapshot_dir):
        raise SystemExit(f"refused: local snapshot directory missing: {snapshot_dir}")
    if not isinstance(texts, list):
        raise SystemExit("refused: texts must be a list")

    import torch
    from transformers import AutoModel, AutoTokenizer

    torch.set_num_threads(1)
    torch.use_deterministic_algorithms(True)

    tokenizer = AutoTokenizer.from_pretrained(snapshot_dir, local_files_only=True)
    model = AutoModel.from_pretrained(snapshot_dir, local_files_only=True)
    model.to("cpu")
    model.eval()

    vectors = []
    with torch.no_grad():
        for raw in texts:
            text = str(raw if raw is not None else "")
            encoded = tokenizer(
                [text],
                padding=False,
                truncation=True,
                max_length=512,
                return_tensors="pt",
            )
            output = model(**encoded)
            cls_hidden = output.last_hidden_state[:, 0]
            normalized = torch.nn.functional.normalize(cls_hidden, p=2, dim=-1)[0]
            vectors.append([float(x) for x in normalized.cpu().tolist()])

    result = {
        "model": model_id,
        "revision": revision,
        "dim": len(vectors[0]) if vectors else 384,
        "offline_verified": True,
        "vectors": vectors,
    }
    sys.stdout.write(json.dumps(result))


if __name__ == "__main__":
    main()
