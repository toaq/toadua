{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/release-22.11";
    flake-utils.url = "github:numtide/flake-utils";
    nix-npm-buildpackage.url = "github:serokell/nix-npm-buildpackage";
    nix-npm-buildpackage.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = { self, nixpkgs, flake-utils, nix-npm-buildpackage, ... }:
    (flake-utils.lib.eachDefaultSystem (system:
      (let
        pkgs = import nixpkgs { inherit system; };
        buildNpmPackage = (pkgs.callPackage nix-npm-buildpackage {
          nodejs = pkgs.nodejs_latest;
        }).buildNpmPackage;
        frontend = buildNpmPackage {
          src = ./frontend;
          npmBuild = "npm run build";
        };
        backend = buildNpmPackage {
          pname = "toadua-backend";
          src = ./.;
          npmBuild = "npm run build";
          installPhase = ''
            mkdir $out
            cp -r dist $out
            cp -r node_modules $out
          '';
        };
        toadua = pkgs.runCommand "toadua" { } ''
          mkdir -p $out/{bin,libexec/toadua}
          cp -r ${backend}/* ${self}/{config,package.json} $out/libexec/toadua
          cp -r ${frontend} $out/libexec/toadua/frontend
          tee >> $out/bin/toadua <<EOF
            ${pkgs.nodejs_latest}/bin/node $out/libexec/toadua/dist/core/server.js \$@
          EOF
          chmod +x $out/bin/toadua
        '';
      in {
        packages = {
          inherit frontend backend toadua;
          default = toadua;
        };
        checks = { inherit toadua; };
        devShells.default =
          pkgs.mkShell { buildInputs = [ pkgs.nodejs_latest ]; };
      }) // {
        nixosModules.default = { pkgs, lib, config, inputs, system, ... }:
          let inherit (config.services.toadua) enable package port dataDir;
          in with lib; {
            options.services.toadua = {
              enable = mkEnableOption "toadua";
              package = mkOption {
                default = self.defaultPackage.${system};
                type = types.package;
              };
              port = mkOption { type = types.port; };
              dataDir = mkOption { type = types.path; };
            };
            config.systemd.services.toadua = {
              inherit enable;
              description = "Toaq Dictionary";
              wantedBy = [ "multi-user.target" ];
              wants = [ "network-online.target" ];
              script = strings.concatStringsSep " "
                ([ "${package}/bin/toadua" "--data-directory" "${dataDir}" ]
                  ++ (lib.optionals (port != null) [
                    "--port"
                    (toString port)
                  ]));
              serviceConfig.WorkingDirectory = dataDir;
            };
          };
      }));
}
