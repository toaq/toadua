{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/release-21.11";
    flake-utils.url = "github:numtide/flake-utils";
    npmlock2nix = {
      url = "github:nix-community/npmlock2nix/master";
      flake = false;
    };
  };

  outputs = { self, nixpkgs, flake-utils, npmlock2nix, ... }:
    (flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        nodejs = pkgs.nodejs-14_x;
        package = { dev }:
          (import npmlock2nix { inherit pkgs; }).build {
            src = ./.;
            inherit nodejs;
            buildCommands = [ (if dev then "npm run dev" else "npm run prod") ];
            installPhase = ''
              cp -r . $out
              mkdir $out/bin
              tee >> $out/bin/toadua <<EOF
                ${nodejs}/bin/node $out/core/server.js \$@
              EOF
              chmod +x $out/bin/toadua
            '';
          };
        toadua = package { dev = false; };
        toaduaDev = package { dev = true; };
      in {
        packages = { inherit toadua toaduaDev; };
        defaultPackage = toadua;
        devShell = pkgs.mkShell { buildInputs = [ nodejs ]; };
      })) // {
        nixosModule = { pkgs, lib, config, inputs, system, ... }:
          let inherit (config.services.toadua) enabled package port dataDir;
          in with lib; {
            options.services.toadua = {
              enabled = mkEnableOption "toadua";
              package = mkOption {
                default = self.defaultPackage.${system};
                type = types.package;
              };
              port = mkOption { type = types.port; };
              dataDir = mkOption { type = types.path; };
            };
            config.systemd.services.toadua = {
              inherit enabled;
              description = "Toaq Dictionary";
              wantedBy = [ "multi-user.target" ];
              wants = [ "network-online.target" ];
              script = strings.concatStringsSep " " ([
                "${pkgs.nodejs-16_x}/bin/node"
                "${package}/core/server.js"
                "--data-directory ${dataDir}"
              ] ++ (lib.optionals (port != null)
                [ "--port ${toString port}" ]));
              serviceConfig.WorkingDirectory = dataDir;
            };
          };
      };
}
