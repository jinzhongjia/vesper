NAME=vesper
DOMAIN=nvimer.org
UUID=$(NAME)@$(DOMAIN)
EXT_DIR=$(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: all build pack install link unlink enable dev logs clean

all: dist/extension.js

node_modules/.pnpm-lock.yaml: package.json
	pnpm install

dist/extension.js: node_modules/.pnpm-lock.yaml *.ts
	pnpm run build

build: dist/extension.js
	@cp metadata.json dist/

$(NAME).zip: build
	@(cd dist && zip ../$(NAME).zip -9r .)

pack: $(NAME).zip

install: $(NAME).zip
	gnome-extensions install --force $(NAME).zip

# Dev install: symlink dist/ into the user extensions dir so rebuilds are picked up live.
link: build
	@mkdir -p $(HOME)/.local/share/gnome-shell/extensions
	@rm -rf $(EXT_DIR)
	@ln -s $(CURDIR)/dist $(EXT_DIR)
	@echo "Linked $(EXT_DIR) -> $(CURDIR)/dist"

unlink:
	@rm -rf $(EXT_DIR)
	@echo "Removed $(EXT_DIR)"

enable:
	gnome-extensions enable $(UUID)

# Nested GNOME Shell session for Wayland testing — official method.
# Requires the mutter devkit (Arch: mutter-devkit, Fedora: mutter-devel, Ubuntu: mutter-dev-bin).
# Inside the nested window run:  gnome-extensions enable $(UUID)
dev:
	dbus-run-session gnome-shell --devkit --wayland

logs:
	journalctl -f -o cat /usr/bin/gnome-shell

clean:
	@rm -rf dist node_modules pnpm-lock.yaml $(NAME).zip
