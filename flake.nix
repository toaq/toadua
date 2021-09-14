{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/master";
    flake-utils.url = "github:numtide/flake-utils";
    npmlock2nix = {
      url = "github:nix-community/npmlock2nix/master";
      flake = false;
    };
  };

  outputs = { self, nixpkgs, flake-utils, npmlock2nix, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        package = dev: (import npmlock2nix {
          pkgs = nixpkgs.legacyPackages.${system};
        }).build {
          src = ./.;
          buildCommands = [ (if dev then "npm run dev" else "npm run prod") ];
          installPhase = "cp -r . $out";
        };
      in {
        packages.toadua = package false;
        packages.toadua-dev = package true;
        defaultPackage = package false;
      });
}
