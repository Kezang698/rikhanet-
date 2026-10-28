The existing root `rikhanet_tft_binary.ckpt` is mounted here read-only by Compose
without moving it. CPU prototype inference recovers its original fitted dataset
encoders and scalers from the checkpoint; a separate training dataset is optional.
If the matching original `training_dataset.pkl` becomes available, place it here.

`prediction_validation.json` is created only by a comparison with independently
exported binary reference probabilities and matching feature windows. The current
root CSV contains three classes, so the application explicitly reports prototype
status. See `docs/BACKEND.md` for setup and limits.
