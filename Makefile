NAME=vesper
DOMAIN=nvimer.org
UUID=$(NAME)@$(DOMAIN)
EXT_DIR=$(HOME)/.local/share/gnome-shell/extensions/$(UUID)

SCHEMA_DIR=schemas
COMPILED_SCHEMA=$(SCHEMA_DIR)/gschemas.compiled
TS_SOURCES=$(wildcard *.ts) $(wildcard lib/*.ts) $(wildcard providers/*.ts)

PO_DIR=po
POT_FILE=$(PO_DIR)/$(NAME).pot
PO_FILES=$(wildcard $(PO_DIR)/*.po)
LOCALE_DIR=locale
MO_FILES=$(patsubst $(PO_DIR)/%.po,$(LOCALE_DIR)/%/LC_MESSAGES/$(NAME).mo,$(PO_FILES))

.PHONY: all build pack install link unlink enable dev logs pot update-po mo clean

all: build

node_modules/.pnpm-lock.yaml: package.json
	pnpm install

dist/extension.js: node_modules/.pnpm-lock.yaml $(TS_SOURCES)
	pnpm run build

$(COMPILED_SCHEMA): $(wildcard $(SCHEMA_DIR)/*.xml)
	glib-compile-schemas $(SCHEMA_DIR)

# i18n: extract translatable strings from sources
$(POT_FILE): $(TS_SOURCES)
	@mkdir -p $(PO_DIR)
	xgettext --from-code=UTF-8 --language=JavaScript \
	  --keyword=_ --keyword=N_ \
	  --keyword=ngettext:1,2 --keyword=pgettext:1c,2 \
	  --package-name=$(NAME) \
	  --output=$@ $(TS_SOURCES)

# Refresh .po files against latest .pot
update-po: $(POT_FILE)
	@for f in $(PO_FILES); do msgmerge --update --backup=none $$f $(POT_FILE); done

# Compile .po -> .mo
$(LOCALE_DIR)/%/LC_MESSAGES/$(NAME).mo: $(PO_DIR)/%.po
	@mkdir -p $(dir $@)
	msgfmt -o $@ $<

pot: $(POT_FILE)
mo: $(MO_FILES)

build: dist/extension.js $(COMPILED_SCHEMA) $(MO_FILES)
	@cp metadata.json dist/
	@mkdir -p dist/schemas
	@cp $(SCHEMA_DIR)/*.xml $(COMPILED_SCHEMA) dist/schemas/
	@if [ -d $(LOCALE_DIR) ]; then cp -r $(LOCALE_DIR) dist/; fi

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
	@rm -rf dist node_modules pnpm-lock.yaml $(NAME).zip $(COMPILED_SCHEMA) $(LOCALE_DIR)
