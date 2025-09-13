import { PrismaClient, Wallet } from '@prisma/client';
import { Wallet as EthersWallet } from 'ethers';
import { encrypt, decrypt } from '../lib/encryption';
import { logger } from '../lib/logger';
import { WalletBalance } from '../types';

export class WalletManager {
  constructor(private prisma: PrismaClient) {}

  async createWallet(
    userId: string,
    name: string,
    privateKey: string,
    isTestnet = true
  ): Promise<Wallet> {
    try {
      // Validate private key
      const ethersWallet = new EthersWallet(privateKey);
      const publicKey = ethersWallet.address;

      // Encrypt private key
      const encryptedPrivateKey = encrypt(privateKey);

      // Check if wallet already exists
      const existingWallet = await this.prisma.wallet.findFirst({
        where: {
          userId,
          publicKey,
        },
      });

      if (existingWallet) {
        throw new Error('Wallet already exists for this user');
      }

      // Deactivate other wallets if this is set as active
      await this.prisma.wallet.updateMany({
        where: {
          userId,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });

      // Create new wallet
      const wallet = await this.prisma.wallet.create({
        data: {
          userId,
          name,
          publicKey,
          encryptedPrivateKey,
          isTestnet,
          isActive: true,
        },
      });

      logger.info('Wallet created', {
        userId,
        walletId: wallet.id,
        publicKey,
        isTestnet,
      });

      return wallet;
    } catch (error) {
      logger.error('Failed to create wallet', { error, userId });
      throw error;
    }
  }

  async getActiveWallet(userId: string): Promise<Wallet | null> {
    return this.prisma.wallet.findFirst({
      where: {
        userId,
        isActive: true,
      },
    });
  }

  async getWalletById(walletId: string, userId: string): Promise<Wallet | null> {
    return this.prisma.wallet.findFirst({
      where: {
        id: walletId,
        userId,
      },
    });
  }

  async listWallets(userId: string): Promise<Wallet[]> {
    return this.prisma.wallet.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async setActiveWallet(walletId: string, userId: string): Promise<Wallet> {
    // Deactivate all wallets
    await this.prisma.wallet.updateMany({
      where: {
        userId,
      },
      data: {
        isActive: false,
      },
    });

    // Activate selected wallet
    const wallet = await this.prisma.wallet.update({
      where: {
        id: walletId,
      },
      data: {
        isActive: true,
      },
    });

    logger.info('Active wallet changed', { userId, walletId });
    return wallet;
  }

  async deleteWallet(walletId: string, userId: string): Promise<void> {
    // Check if wallet has open positions
    const openPositions = await this.prisma.position.count({
      where: {
        walletId,
        status: 'open',
      },
    });

    if (openPositions > 0) {
      throw new Error('Cannot delete wallet with open positions');
    }

    await this.prisma.wallet.delete({
      where: {
        id: walletId,
      },
    });

    logger.info('Wallet deleted', { userId, walletId });
  }

  async getDecryptedPrivateKey(walletId: string, userId: string): Promise<string> {
    const wallet = await this.getWalletById(walletId, userId);

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    try {
      return decrypt(wallet.encryptedPrivateKey);
    } catch (error) {
      logger.error('Failed to decrypt private key', { error, walletId });
      throw new Error('Failed to decrypt wallet');
    }
  }

  async getEthersWallet(walletId: string, userId: string): Promise<EthersWallet> {
    const privateKey = await this.getDecryptedPrivateKey(walletId, userId);
    return new EthersWallet(privateKey);
  }

  async validateWallet(privateKey: string): Promise<{ valid: boolean; address?: string }> {
    try {
      const wallet = new EthersWallet(privateKey);
      return {
        valid: true,
        address: wallet.address,
      };
    } catch (error) {
      return {
        valid: false,
      };
    }
  }

  async rotateEncryption(userId: string, oldMasterKey: string, newMasterKey: string): Promise<void> {
    const wallets = await this.listWallets(userId);

    for (const wallet of wallets) {
      try {
        // Decrypt with old key
        const decrypted = decrypt(wallet.encryptedPrivateKey);

        // Re-encrypt with new key
        const newEncrypted = encrypt(decrypted);

        // Update wallet
        await this.prisma.wallet.update({
          where: {
            id: wallet.id,
          },
          data: {
            encryptedPrivateKey: newEncrypted,
          },
        });

        logger.info('Wallet encryption rotated', { walletId: wallet.id });
      } catch (error) {
        logger.error('Failed to rotate wallet encryption', {
          error,
          walletId: wallet.id
        });
        throw error;
      }
    }
  }

  // Mock balance for now - will be replaced with actual Hyperliquid integration
  async getWalletBalance(walletId: string, userId: string): Promise<WalletBalance> {
    const wallet = await this.getWalletById(walletId, userId);

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // TODO: Integrate with Hyperliquid API to get actual balance
    return {
      total: 10000,
      available: 9000,
      reserved: 1000,
      currency: 'USDC',
    };
  }
}