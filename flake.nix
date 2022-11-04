{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/release-22.05";
    flake-utils.url = "github:numtide/flake-utils";
    nix-npm-buildpackage.url = "github:serokell/nix-npm-buildpackage";
    nix-npm-buildpackage.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = { self, nixpkgs, flake-utils, nix-npm-buildpackage, ... }:
    (flake-utils.lib.eachDefaultSystem (system:
      (let
        pkgs = import nixpkgs { inherit system; };
        package = { dev }:
          (pkgs.callPackage nix-npm-buildpackage {
            nodejs = pkgs.nodejs_latest;
          }).buildNpmPackage {
            src = ./.;
            installPhase = ''
              ${if dev then "npm run dev" else "npm run prod"}
              cp -r . $out
              mkdir $out/bin
              tee >> $out/bin/toadua <<EOF
                ${pkgs.nodejs_latest}/bin/node $out/core/server.js \$@
              EOF
              chmod +x $out/bin/toadua
            '';
          };
        toadua = package { dev = false; };
        toaduaDev = package { dev = true; };
      in {
        packages = { inherit toadua toaduaDev; };
        defaultPackage = toadua;
        devShell = pkgs.mkShell { buildInputs = [ pkgs.nodejs_latest ]; };
      }) // {
        nixosModule = { pkgs, lib, config, inputs, system, ... }:
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
              script = strings.concatStringsSep " " ([
                "${pkgs.nodejs_latest}/bin/node"
                "${package}/core/server.js"
                "--data-directory ${dataDir}"
              ] ++ (lib.optionals (port != null)
                [ "--port ${toString port}" ]));
              serviceConfig.WorkingDirectory = dataDir;
            };
          };
      }));
}
