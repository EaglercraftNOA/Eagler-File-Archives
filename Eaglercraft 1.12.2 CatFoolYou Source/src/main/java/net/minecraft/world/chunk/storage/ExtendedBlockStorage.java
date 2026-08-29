package net.minecraft.world.chunk.storage;

import net.minecraft.block.Block;
import net.minecraft.block.state.IBlockState;
import net.minecraft.init.Blocks;
import net.minecraft.src.Reflector;
import net.minecraft.world.chunk.BlockStateContainer;
import net.minecraft.world.chunk.NibbleArray;

public class ExtendedBlockStorage
{

    private final int yBase;

    private int blockRefCount;

    private int tickRefCount;
    private final BlockStateContainer data;

    private NibbleArray blockLight;

    private NibbleArray skyLight;

    public ExtendedBlockStorage(int y, boolean storeSkylight)
    {
        this.yBase = y;
        this.data = new BlockStateContainer();
        this.blockLight = new NibbleArray();

        if (storeSkylight)
        {
            this.skyLight = new NibbleArray();
        }
    }

    public IBlockState get(int x, int y, int z)
    {
        return this.data.get(x, y, z);
    }

    public void set(int x, int y, int z, IBlockState state)
    {
        if (Reflector.IExtendedBlockState.isInstance(state)) 
        {
            state = (IBlockState)Reflector.call(state, Reflector.IExtendedBlockState_getClean);
        }

        IBlockState iblockstate = this.get(x, y, z);  
        Block block = iblockstate.getBlock(); 
        Block block1 = state.getBlock(); 

        if (block != Blocks.AIR)  
        {
            --this.blockRefCount; 

            if (block.getTickRandomly()) 
            {
                --this.tickRefCount; 
            }
        }

        if (block1 != Blocks.AIR) 
        {
            ++this.blockRefCount; 

            if (block1.getTickRandomly()) 
            {
                ++this.tickRefCount; 
            }
        }

        this.data.set(x, y, z, state);  
    }

    public boolean isEmpty()
    {
        return this.blockRefCount == 0;
    }

    public boolean needsRandomTick()
    {
        return this.tickRefCount > 0;
    }

    public int getYLocation()
    {
        return this.yBase;
    }

    public void setSkyLight(int x, int y, int z, int value)
    {
        this.skyLight.set(x, y, z, value);
    }

    public int getSkyLight(int x, int y, int z)
    {
        return this.skyLight.get(x, y, z);
    }

    public void setBlockLight(int x, int y, int z, int value)
    {
        this.blockLight.set(x, y, z, value);
    }

    public int getBlockLight(int x, int y, int z)
    {
        return this.blockLight.get(x, y, z);
    }

    public void recalculateRefCounts()
    {
        IBlockState iblockstate = Blocks.AIR.getDefaultState();  
        int i = 0;
        int j = 0;

        for (int k = 0; k < 16; ++k) 
        {
            for (int l = 0; l < 16; ++l)
            {
                for (int i1 = 0; i1 < 16; ++i1)
                {
                    IBlockState iblockstate1 = this.data.get(i1, k, l); 

                    if (iblockstate1 != iblockstate)  
                    {
                        ++i; 
                        Block block = iblockstate1.getBlock(); 

                        if (block.getTickRandomly())  
                        {
                            ++j;
                        }
                    }
                }
            }
        }

        this.blockRefCount = i;  
        this.tickRefCount = j;  
    }

    public BlockStateContainer getData()
    {
        return this.data;
    }

    public NibbleArray getBlockLight()
    {
        return this.blockLight;
    }

    public NibbleArray getSkyLight()
    {
        return this.skyLight;
    }

    public void setBlockLight(NibbleArray newBlocklightArray)
    {
        this.blockLight = newBlocklightArray;
    }

    public void setSkyLight(NibbleArray newSkylightArray)
    {
        this.skyLight = newSkylightArray;
    }
}