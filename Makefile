WASM_PACK ?= $(HOME)/.cargo/bin/wasm-pack
DATA_DIR ?= ./sample-data

.PHONY: build rust-build web-build serve test release-check clean

build: rust-build web-build

rust-build:
	$(WASM_PACK) build --target web --out-dir pkg

web-build:
	DATA_DIR="$(DATA_DIR)" python3 scripts/build.py

serve:
	python3 -m http.server 8080 --directory dist

test:
	cargo test

release-check: test build
	python3 scripts/release_check.py

clean:
	rm -rf pkg dist
